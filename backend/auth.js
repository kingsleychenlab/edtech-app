const crypto = require("node:crypto");
const { sessions, usersById } = require("./store");

const SESSION_COOKIE = "revizely_session";
// Vercel (and any HTTPS host) should only hand the session cookie back over TLS.
const SECURE_COOKIE = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";

function cookieAttributes(maxAge) {
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? "; Secure" : ""}`;
}

// Roles are granted by email allow-list so the creator and admin portals can be
// opened to specific accounts without a user-management UI.
function rolesFor(email) {
  const roles = ["student"];
  const listed = (key) =>
    String(process.env[key] || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .includes(email);
  if (listed("CREATOR_EMAILS")) roles.push("creator");
  if (listed("ADMIN_EMAILS")) roles.push("admin");
  return roles;
}

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function passwordMatches(password, user) {
  const candidate = crypto.scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))])
  );
}

function getSessionUser(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  const userId = token ? sessions.get(token) : null;
  return userId ? usersById.get(userId) : null;
}

function createSession(user, response) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, user.id);
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; ${cookieAttributes(604800)}`);
}

function clearSession(request, response) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; ${cookieAttributes(0)}`);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    friendCode: user.friendCode,
    roles: user.roles || ["student"]
  };
}

module.exports = {
  clearSession,
  rolesFor,
  createSession,
  getSessionUser,
  hashPassword,
  normaliseEmail,
  passwordMatches,
  publicUser
};
