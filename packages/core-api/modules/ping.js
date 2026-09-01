// Trivial example module — proves the npm workspace links this package into
// `backend/` correctly and demonstrates the module convention documented in
// README.md. Not meant to ship as a real feature; delete once a real module
// (e.g. facturación) exists and exercises the same contract.
const { Router } = require("express");

function registerRoutes(app) {
  const router = Router();
  router.get("/ping", (req, res) => {
    res.json({ ok: true, module: "ping", source: "@duck-hack/core-api" });
  });
  app.use("/api/ping", router);
}

module.exports = {
  name: "ping",
  registerRoutes,
  models: {},
};
