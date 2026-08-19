// Vercel serverless handler.
//
// The local server (backend/index.js) and this file are the two entry points
// into the same backend: both delegate to handleApi() in backend/api.js, so
// there is no duplicated routing logic.
//
// Vercel only discovers functions in a top-level /api directory, so the root
// api/[...path].js file re-exports this handler.
require("./config");
const { handleApi } = require("./api");
const { sendJson } = require("./http");

module.exports = async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    await handleApi(request, response, url.pathname);
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, error.status || 500, {
        error: error.status ? error.message : "Internal server error."
      });
    }
  }
};
