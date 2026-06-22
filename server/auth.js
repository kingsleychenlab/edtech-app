const crypto = require("node:crypto");
const { sessions, usersById } = require("./store");

const SESSION_COOKIE = "revizely_session";

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
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`);
}

function clearSession(request, response) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

module.exports = {
  clearSession,
  createSession,
  getSessionUser,
  hashPassword,
  normaliseEmail,
  passwordMatches,
  publicUser
};
