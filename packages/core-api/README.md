# @duck-hack/core-api

Backend modules (routes + Mongoose models) shared across every store's
independently-deployed backend. See `docs/adr-monorepo-shared-packages.md` for
why this exists: each store keeps its own backend/DB/deploy, but a module's
*code* lives here once so every store's backend can mount it.

## Module convention

A module is a plain object with this shape:

```js
module.exports = {
  name: "facturacion",              // unique, used for logging/diagnostics
  registerRoutes(app, ctx) {         // ctx: { mongooseConnection } — the app's own connection
    const router = require("express").Router();
    router.get("/", (req, res) => { /* ... */ });
    app.use("/api/facturacion", router);
  },
  models: {
    // Mongoose schemas the module owns, keyed by model name. The consuming
    // app is responsible for registering them against its own connection
    // (this package never opens a DB connection itself).
    Invoice: invoiceSchema,
  },
};
```

Add it to the `modules` array exported from `index.js`. Nothing else in this
package needs to change for a consuming app to pick it up.

## How an app mounts these modules

In `backend/server.js`, after the app's existing hardcoded routes, loop over
`@duck-hack/core-api`'s modules and register each one:

```js
const { modules } = require("@duck-hack/core-api");
modules.forEach((mod) => mod.registerRoutes(app, { mongooseConnection: mongoose.connection }));
```

This phase only ships the trivial `ping` example module (see `modules/ping.js`)
to prove the workspace link resolves end-to-end. `backend/server.js` has not
been wired to consume it yet — that happens once a real module (e.g.
facturación) is built on top of this convention, per the phase-2 follow-up
noted in `docs/adr-monorepo-shared-packages.md`.

## Scope boundary

This package must stay database-connection-agnostic: it exports schemas and
route factories, never a `mongoose.connect(...)` call or a hardcoded DB name —
each store's own `backend/server.js` still owns its own single Mongo
connection, exactly as today.
