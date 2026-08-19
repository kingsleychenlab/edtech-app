const crypto = require("node:crypto");
const {
  clearSession,
  createSession,
  getSessionUser,
  hashPassword,
  normaliseEmail,
  passwordMatches,
  publicUser
} = require("./auth");
const { readJson, sendJson } = require("./http");
const { competitionClasses, createWorkspace, usersByEmail, usersById, workspaces } = require("./store");
const { features, plans } = require("./premium");
const { runAiAction } = require("./ai");

async function handleApi(request, response, pathname) {
  if (pathname === "/api/premium/catalogue" && request.method === "GET") {
    return sendJson(response, 200, { plans, features, currency: "GBP" });
  }

  if (pathname === "/api/auth/signup" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const email = normaliseEmail(body.email);
    const password = String(body.password || "");

    if (!name || !email.includes("@") || password.length < 8) {
      return sendJson(response, 400, { error: "Enter a name, valid email and password of at least 8 characters." });
    }
    if (usersByEmail.has(email)) {
      return sendJson(response, 409, { error: "An account with this email already exists." });
    }

    const passwordRecord = hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordSalt: passwordRecord.salt,
      passwordHash: passwordRecord.hash,
      createdAt: new Date().toISOString()
    };
    usersByEmail.set(email, user);
    usersById.set(user.id, user);
    workspaces.set(user.id, createWorkspace(user));
    createSession(user, response);
    return sendJson(response, 201, { user: publicUser(user) });
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const user = usersByEmail.get(normaliseEmail(body.email));
    if (!user || !passwordMatches(String(body.password || ""), user)) {
      return sendJson(response, 401, { error: "Email or password is incorrect." });
    }
    createSession(user, response);
    return sendJson(response, 200, { user: publicUser(user) });
  }

  if (pathname === "/api/auth/provider" && request.method === "POST") {
    return sendJson(response, 501, { error: "Social sign-in requires provider credentials and is not configured yet." });
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    clearSession(request, response);
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/session" && request.method === "GET") {
    const user = getSessionUser(request);
    return user ? sendJson(response, 200, { user: publicUser(user) }) : sendJson(response, 401, { error: "Not authenticated." });
  }

  const user = getSessionUser(request);
  if (!user) return sendJson(response, 401, { error: "Not authenticated." });

  if (pathname === "/api/workspace" && request.method === "GET") {
    const workspace = workspaces.get(user.id) || createWorkspace(user);
    workspaces.set(user.id, workspace);
    return sendJson(response, 200, { workspace });
  }

  if (pathname === "/api/workspace" && request.method === "PUT") {
    const body = await readJson(request);
    if (!body.workspace || typeof body.workspace !== "object" || Array.isArray(body.workspace)) {
      return sendJson(response, 400, { error: "A workspace object is required." });
    }
    const current = workspaces.get(user.id) || createWorkspace(user);
    const updated = {
      ...current,
      ...body.workspace,
      profile: { ...current.profile, ...(body.workspace.profile || {}), email: user.email }
    };
    workspaces.set(user.id, updated);
    if (updated.profile.name) user.name = String(updated.profile.name).trim();
    return sendJson(response, 200, { workspace: updated });
  }

  if (pathname === "/api/workspace" && request.method === "DELETE") {
    const workspace = createWorkspace(user);
    workspaces.set(user.id, workspace);
    return sendJson(response, 200, { workspace });
  }

  if (pathname === "/api/leaderboard" && request.method === "GET") {
    const entries = [...usersById.values()].map((entry) => {
      const workspace = workspaces.get(entry.id) || createWorkspace(entry);
      return { id: entry.id, name: entry.name, points: workspacePoints(workspace), current: entry.id === user.id };
    }).sort((a, b) => b.points - a.points).slice(0, 50);
    return sendJson(response, 200, { entries });
  }

  if (pathname === "/api/classes" && request.method === "GET") {
    const classes = [...competitionClasses.values()]
      .filter((item) => item.members.includes(user.id))
      .map((item) => publicClass(item, user.id));
    return sendJson(response, 200, { classes });
  }

  if (pathname === "/api/classes" && request.method === "POST") {
    const body = await readJson(request);
    if (body.action === "create") {
      const name = String(body.name || "").trim().slice(0, 80);
      if (!name) return sendJson(response, 400, { error: "Class name is required." });
      let code;
      do code = crypto.randomBytes(3).toString("hex").toUpperCase(); while (competitionClasses.has(code));
      competitionClasses.set(code, { code, name, ownerId: user.id, members: [user.id], createdAt: new Date().toISOString() });
      return sendJson(response, 201, { class: publicClass(competitionClasses.get(code), user.id) });
    }
    if (body.action === "join") {
      const code = String(body.code || "").trim().toUpperCase();
      const item = competitionClasses.get(code);
      if (!item) return sendJson(response, 404, { error: "No class was found for that code." });
      if (!item.members.includes(user.id)) item.members.push(user.id);
      return sendJson(response, 200, { class: publicClass(item, user.id) });
    }
    return sendJson(response, 400, { error: "Choose create or join." });
  }

  if (pathname === "/api/tutor" && request.method === "POST") {
    const body = await readJson(request);
    return sendJson(response, 200, await runAiAction("chat", body));
  }

  if (pathname.startsWith("/api/ai/") && request.method === "POST") {
    const action = pathname.slice("/api/ai/".length);
    const body = await readJson(request);
    return sendJson(response, 200, await runAiAction(action, body));
  }

  if (pathname === "/api/premium/status" && request.method === "GET") {
    const workspace = workspaces.get(user.id) || createWorkspace(user);
    return sendJson(response, 200, { subscription: workspace.subscription });
  }

  if (pathname === "/api/premium/checkout" && request.method === "POST") {
    const body = await readJson(request);
    const plan = plans.find((item) => item.type === body.plan);
    if (!plan) return sendJson(response, 400, { error: "Choose a valid premium plan." });
    const checkoutUrl = process.env[`STRIPE_CHECKOUT_${plan.type.toUpperCase()}_URL`];
    if (!checkoutUrl) return sendJson(response, 503, { error: "Payments need Stripe checkout links on the server." });
    return sendJson(response, 200, { checkoutUrl });
  }

  return sendJson(response, 404, { error: "API route not found." });
}

function workspacePoints(workspace) {
  const cards = workspace.decks.reduce((sum, deck) => sum + (deck.cards?.length || 0), 0);
  const completedTasks = workspace.tasks.filter((task) => task.done).length;
  return workspace.notes.length * 5 + cards * 2 + workspace.quizAttempts.length * 20 + workspace.papers.filter((paper) => paper.score > 0).length * 15 + completedTasks * 10 + workspace.focusSessions * 10;
}

function publicClass(item, currentUserId) {
  const leaderboard = item.members.map((id) => {
    const member = usersById.get(id);
    const workspace = member ? workspaces.get(id) || createWorkspace(member) : null;
    return { id, name: member?.name || "Student", points: workspace ? workspacePoints(workspace) : 0, current: id === currentUserId };
  }).sort((a, b) => b.points - a.points);
  return { code: item.code, name: item.name, owner: item.ownerId === currentUserId, members: leaderboard.length, leaderboard };
}

module.exports = { handleApi };
