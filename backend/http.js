const fs = require("node:fs");
const path = require("node:path");

const BODY_LIMIT = 1_000_000;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  // Serverless platforms (Vercel) parse and consume the request stream before
  // the handler runs, so prefer an already-parsed body when one is present.
  if (request.body !== undefined && request.body !== null) {
    const body = request.body;
    if (typeof body === "object" && !Buffer.isBuffer(body)) return Promise.resolve(body);
    const raw = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    try {
      return Promise.resolve(raw ? JSON.parse(raw) : {});
    } catch {
      return Promise.reject(Object.assign(new Error("Invalid JSON."), { status: 400 }));
    }
  }
  if (request.readableEnded) return Promise.resolve({});

  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > BODY_LIMIT) {
        reject(Object.assign(new Error("Request is too large."), { status: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function serveStatic(root, response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(root, `.${decodeURIComponent(requestedPath)}`);

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return sendJson(response, 403, { error: "Forbidden." });
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return response.end("Not found");
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

module.exports = { readJson, sendJson, serveStatic };
