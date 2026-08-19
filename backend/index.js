const http = require("node:http");
const path = require("node:path");
require("./config");
const { handleApi } = require("./api");
const { sendJson, serveStatic } = require("./http");

const PORT = Number(process.env.PORT) || 4173;
const ROOT = path.resolve(__dirname, "..", "frontend");

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
    } else if (request.method === "GET" || request.method === "HEAD") {
      serveStatic(ROOT, response, url.pathname);
    } else {
      sendJson(response, 405, { error: "Method not allowed." });
    }
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, error.status || 500, { error: error.status ? error.message : "Internal server error." });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Revizely.ai running at http://localhost:${PORT}`);
  console.log("Data is stored in memory and resets when the server stops.");
});
