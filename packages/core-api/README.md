# @duck-hack/core-api

Backend modules (routes + Mongoose models) shared across every store's
independently-deployed backend. See `docs/adr-monorepo-shared-packages.md` for
why this exists: each store keeps its own backend/DB/deploy, but a module's
*code* lives here once so every store's backend can mount it.

## Modules in this package

- `modules/products.js` — product catalog (`/api/products`).
- `modules/inventory.js` — per-product stock (`/api/inventory`).
- `modules/orders.js` — orders, created manually from the admin panel for now
  (`/api/orders`).

## Module convention

A module is a plain object with this shape:

```js
module.exports = {
  name: "facturacion",              // unique, used for logging/diagnostics
  registerRoutes(app, ctx) {         // see ctx contract below
    const router = require("express").Router();
    router.get("/", ctx.authorizeRoles(ctx.ROLES.SUPER_ADMIN), (req, res) => { /* ... */ });
    app.use("/api/facturacion", router);
  },
  models: {
    // Mongoose schemas the module owns, keyed by model name. Exported for
    // introspection/reuse — registerRoutes is responsible for actually
    // compiling the model against ctx.mongooseConnection (see
    // lib/moduleHelpers.js#getOrCreateModel).
    Invoice: invoiceSchema,
  },
};
```

Add it to the `modules` array exported from `index.js`. Nothing else in this
package needs to change for a consuming app to pick it up.

### `ctx` contract

The consuming app's `registerRoutes(app, ctx)` call supplies:

```
ctx = {
  mongooseConnection,  // the app's own Mongo connection — register models via
                        // ctx.mongooseConnection.model(name, schema), never
                        // mongoose.connect() from inside this package
  verifyToken,          // auth middleware — from the app's own authMiddleware
  authorizeRoles,        // (...roles) => middleware
  ROLES,                 // { SUPER_ADMIN, STORE_ADMIN, CATALOG_MANAGER, ORDER_MANAGER, CUSTOMER }
  STAFF_ROLES,            // ROLES minus CUSTOMER, for "any staff member can read" routes
  sendError,              // (res, status, code, message, details?) — the app's error envelope
}
```

These are injected rather than imported directly so this package never
depends on a specific app's file layout — see "Scope boundary" below. Reuse
`lib/moduleHelpers.js` (`sanitizeDoc`, `handleMongooseError`,
`asTrimmedString`, `asFiniteNumber`, `isValidObjectId`, `getOrCreateModel`)
across new modules instead of re-deriving the same small helpers per file.

### How an app mounts these modules

In `backend/server.js`, after the app's existing hardcoded routes:

```js
const { modules } = require("@duck-hack/core-api");
modules.forEach((mod) =>
  mod.registerRoutes(app, {
    mongooseConnection: mongoose.connection,
    verifyToken,
    authorizeRoles,
    ROLES,
    STAFF_ROLES,
    sendError,
  })
);
```

## Scope boundary

This package must stay database-connection-agnostic and app-agnostic: it
exports schemas, route factories, and a couple of pure helpers — never a
`mongoose.connect(...)` call, a hardcoded DB name, or a `require(...)` that
reaches into `backend/` or any other consuming app. Everything an app-specific
concern (auth, error formatting) needs is passed in via `ctx`.
