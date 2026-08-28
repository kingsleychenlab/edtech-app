const crypto = require("node:crypto");
const {
  clearSession,
  createSession,
  getSessionUser,
  hashPassword,
  normaliseEmail,
  passwordMatches,
  publicUser,
  rolesFor
} = require("./auth");
const { readJson, sendJson } = require("./http");
const {
  challenges,
  competitionClasses,
  createWorkspace,
  friendCodes,
  usersByEmail,
  usersById,
  workspaces
} = require("./store");
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
    let friendCode;
    do friendCode = crypto.randomBytes(3).toString("hex").toUpperCase(); while (friendCodes.has(friendCode));
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordSalt: passwordRecord.salt,
      passwordHash: passwordRecord.hash,
      friendCode,
      roles: rolesFor(email),
      friends: [],
      createdAt: new Date().toISOString()
    };
    usersByEmail.set(email, user);
    usersById.set(user.id, user);
    friendCodes.set(friendCode, user.id);
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
    user.roles = rolesFor(user.email);
    if (!user.friendCode) {
      do user.friendCode = crypto.randomBytes(3).toString("hex").toUpperCase(); while (friendCodes.has(user.friendCode));
      friendCodes.set(user.friendCode, user.id);
    }
    if (!Array.isArray(user.friends)) user.friends = [];
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
    const incoming = body.workspace;
    // Nested settings objects are merged rather than replaced, so a client that
    // posts a partial workspace cannot silently drop preferences it did not send.
    const mergeObject = (key) => ({ ...current[key], ...(incoming[key] && typeof incoming[key] === "object" ? incoming[key] : {}) });
    const updated = {
      ...current,
      ...incoming,
      profile: { ...mergeObject("profile"), email: user.email },
      preferences: mergeObject("preferences"),
      notifications: mergeObject("notifications"),
      streak: mergeObject("streak"),
      xp: mergeObject("xp"),
      cv: mergeObject("cv"),
      subscription: mergeObject("subscription")
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
      return {
        id: entry.id,
        name: entry.name,
        points: workspacePoints(workspace),
        xp: workspace.xp?.total || 0,
        streak: workspace.streak?.current || 0,
        current: entry.id === user.id
      };
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

  if (pathname === "/api/friends" && request.method === "GET") {
    return sendJson(response, 200, { friends: friendList(user), friendCode: user.friendCode });
  }

  if (pathname === "/api/friends" && request.method === "POST") {
    const body = await readJson(request);
    if (body.action === "add") {
      const code = String(body.code || "").trim().toUpperCase();
      const targetId = friendCodes.get(code);
      if (!targetId) return sendJson(response, 404, { error: "No student was found for that friend code." });
      if (targetId === user.id) return sendJson(response, 400, { error: "That is your own friend code." });
      addFriend(user, targetId);
      addFriend(usersById.get(targetId), user.id);
      return sendJson(response, 201, { friends: friendList(user), friendCode: user.friendCode });
    }
    if (body.action === "remove") {
      const targetId = String(body.id || "");
      user.friends = (user.friends || []).filter((id) => id !== targetId);
      const other = usersById.get(targetId);
      if (other) other.friends = (other.friends || []).filter((id) => id !== user.id);
      return sendJson(response, 200, { friends: friendList(user), friendCode: user.friendCode });
    }
    return sendJson(response, 400, { error: "Choose add or remove." });
  }

  if (pathname === "/api/challenges" && request.method === "GET") {
    return sendJson(response, 200, { challenges: challengeList(user) });
  }

  if (pathname === "/api/challenges" && request.method === "POST") {
    const body = await readJson(request);
    if (body.action === "create") {
      const title = String(body.title || "").trim().slice(0, 80);
      const metric = ["xp", "tasks", "focus", "quizzes"].includes(body.metric) ? body.metric : "xp";
      const target = Math.min(Math.max(Number(body.target) || 100, 1), 100000);
      const days = Math.min(Math.max(Number(body.days) || 7, 1), 90);
      if (!title) return sendJson(response, 400, { error: "Challenge name is required." });
      const id = crypto.randomUUID();
      const endsAt = new Date(Date.now() + days * 86400000).toISOString();
      challenges.set(id, { id, title, metric, target, endsAt, ownerId: user.id, members: [user.id], createdAt: new Date().toISOString() });
      return sendJson(response, 201, { challenges: challengeList(user) });
    }
    if (body.action === "join") {
      const challenge = challenges.get(String(body.id || ""));
      if (!challenge) return sendJson(response, 404, { error: "That challenge no longer exists." });
      if (!challenge.members.includes(user.id)) challenge.members.push(user.id);
      return sendJson(response, 200, { challenges: challengeList(user) });
    }
    if (body.action === "leave") {
      const challenge = challenges.get(String(body.id || ""));
      if (challenge) {
        challenge.members = challenge.members.filter((id) => id !== user.id);
        if (!challenge.members.length) challenges.delete(challenge.id);
      }
      return sendJson(response, 200, { challenges: challengeList(user) });
    }
    return sendJson(response, 400, { error: "Choose create, join or leave." });
  }

  if (pathname === "/api/challenges/open" && request.method === "GET") {
    const friendIds = new Set(user.friends || []);
    const open = [...challenges.values()]
      .filter((item) => !item.members.includes(user.id) && item.members.some((id) => friendIds.has(id)))
      .map((item) => publicChallenge(item, user.id));
    return sendJson(response, 200, { challenges: open });
  }

  if (pathname === "/api/account" && request.method === "DELETE") {
    usersByEmail.delete(user.email);
    usersById.delete(user.id);
    workspaces.delete(user.id);
    friendCodes.delete(user.friendCode);
    for (const other of usersById.values()) {
      if (Array.isArray(other.friends)) other.friends = other.friends.filter((id) => id !== user.id);
    }
    for (const [code, item] of competitionClasses) {
      item.members = item.members.filter((id) => id !== user.id);
      if (!item.members.length) competitionClasses.delete(code);
    }
    for (const [id, item] of challenges) {
      item.members = item.members.filter((memberId) => memberId !== user.id);
      if (!item.members.length) challenges.delete(id);
    }
    clearSession(request, response);
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/premium/cancel" && request.method === "POST") {
    const workspace = workspaces.get(user.id) || createWorkspace(user);
    workspace.subscription = { status: "free", plan: null, currentPeriodEnd: null };
    workspaces.set(user.id, workspace);
    return sendJson(response, 200, { subscription: workspace.subscription });
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
  const earned = workspace.notes.length * 5
    + cards * 2
    + workspace.quizAttempts.length * 20
    + workspace.papers.filter((paper) => paper.score > 0).length * 15
    + completedTasks * 10
    + workspace.focusSessions * 10;
  // A streak is worth a small standing bonus so consistency counts for something.
  return earned + (workspace.streak?.current || 0) * 5;
}

function addFriend(user, friendId) {
  if (!user) return;
  if (!Array.isArray(user.friends)) user.friends = [];
  if (!user.friends.includes(friendId)) user.friends.push(friendId);
}

function friendList(user) {
  return (user.friends || [])
    .map((id) => usersById.get(id))
    .filter(Boolean)
    .map((friend) => {
      const workspace = workspaces.get(friend.id) || createWorkspace(friend);
      return {
        id: friend.id,
        name: friend.name,
        points: workspacePoints(workspace),
        xp: workspace.xp?.total || 0,
        streak: workspace.streak?.current || 0
      };
    })
    .sort((a, b) => b.points - a.points);
}

function challengeProgress(workspace, metric) {
  if (!workspace) return 0;
  if (metric === "tasks") return workspace.tasks.filter((task) => task.done).length;
  if (metric === "focus") return workspace.focusSessions || 0;
  if (metric === "quizzes") return workspace.quizAttempts.length;
  return workspace.xp?.total || 0;
}

function publicChallenge(item, currentUserId) {
  const standings = item.members
    .map((id) => {
      const member = usersById.get(id);
      const workspace = member ? workspaces.get(id) || createWorkspace(member) : null;
      return {
        id,
        name: member?.name || "Student",
        value: challengeProgress(workspace, item.metric),
        current: id === currentUserId
      };
    })
    .sort((a, b) => b.value - a.value);
  return {
    id: item.id,
    title: item.title,
    metric: item.metric,
    target: item.target,
    endsAt: item.endsAt,
    owner: item.ownerId === currentUserId,
    joined: item.members.includes(currentUserId),
    members: standings.length,
    standings
  };
}

function challengeList(user) {
  return [...challenges.values()]
    .filter((item) => item.members.includes(user.id))
    .map((item) => publicChallenge(item, user.id))
    .sort((a, b) => String(a.endsAt).localeCompare(String(b.endsAt)));
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
