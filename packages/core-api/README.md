# @duck-hack/core-api

Backend modules (routes + Mongoose models) shared across every store's
independently-deployed backend. See `docs/adr-monorepo-shared-packages.md` for
why this exists: each store keeps its own backend/DB/deploy, but a module's
*code* lives here once so every store's backend can mount it.

## Modules in this package

- `modules/auth.js` — users, auth, RBAC (`/api/users/*`). Special: besides
  the standard `{name, registerRoutes, models}`, it also exports `auth`
  (`createAuthMiddleware`, `isValidRole`, `ROLES`, `STAFF_ROLES`,
  `validateJwtEnvConfig`) — `index.js` re-exports this at the top level. It's
  the *source* of RBAC for the whole app now, not a consumer of it.
- `modules/mail.js` — contact-form email (`POST /api/mail/send-email`).
- `modules/uploads.js` — product image upload (`POST /api/uploads/products-image`).
- `modules/storeConfig.js` — store branding/content, singleton per deployment
  (`/api/store-config/*`, including the public `GET /public` the storefront
  reads).
- `modules/products.js` — product catalog (`/api/products`).
- `modules/inventory.js` — per-product stock (`/api/inventory`).
- `modules/orders.js` — orders, created manually from the admin panel for now
  (`/api/orders`).

Still in `backend/`, and **not** a candidate to move here — Duck-Hack's own
internal agency-management tooling, not a per-store eCommerce feature:
AgencyClient, Accounting, Invoices, Infra/Portainer.

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
  mongooseConnection,        // the app's own Mongo connection — register models via
                              // ctx.mongooseConnection.model(name, schema), never
                              // mongoose.connect() from inside this package
  verifyToken,                // built from this package's own auth module (see below),
  authorizeRoles,              // not from the consuming app — the app just calls
                                // auth.createAuthMiddleware(sendError) once and forwards these
  ROLES,                        // { SUPER_ADMIN, STORE_ADMIN, CATALOG_MANAGER, ORDER_MANAGER, CUSTOMER }
  STAFF_ROLES,                   // ROLES minus CUSTOMER, for "any staff member can read" routes
  sendError,                      // (res, status, code, message, details?) — the app's error envelope
  resolveLiveMetricSources,        // optional, only modules/storeConfig.js uses it — see its own header comment
}
```

`sendError` is the one piece that genuinely comes from the consuming app (its
own error-response format) — everything auth-related is *circular*: this
package defines it (`modules/auth.js`), the app pulls it back out
(`require("@duck-hack/core-api").auth`) and hands it back in via `ctx` so
every module (including `auth` itself) receives it the same uniform way. This
keeps the package app-agnostic — see "Scope boundary" below — while still
letting `backend/`'s own leftover routes (AgencyClient, Accounting, Invoices,
Infra) pull the same `verifyToken`/`authorizeRoles`/`ROLES` from
`require("@duck-hack/core-api").auth` instead of duplicating RBAC.

Reuse `lib/moduleHelpers.js` (`sanitizeDoc`, `handleMongooseError`,
`asTrimmedString`, `asFiniteNumber`, `isValidObjectId`, `getOrCreateModel`)
across new modules instead of re-deriving the same small helpers per file.

### How an app mounts these modules

In `backend/server.js`:

```js
const { modules, auth } = require("@duck-hack/core-api");
const { sendError } = require("./utils/httpResponses");

const { verifyToken, authorizeRoles } = auth.createAuthMiddleware(sendError);
const { ROLES, STAFF_ROLES, validateJwtEnvConfig } = auth;
validateJwtEnvConfig(); // fail fast at boot if JWT_* env vars are missing/invalid

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

Any other file in `backend/` that needs RBAC directly (not through a
`registerRoutes(app, ctx)` call) does the same two lines itself:
`const { auth } = require("@duck-hack/core-api"); const { verifyToken,
authorizeRoles } = auth.createAuthMiddleware(sendError);` — see
`backend/routes/agencyClient.routes.js` for a real example.

## Scope boundary

This package must stay database-connection-agnostic and app-agnostic: it
exports schemas, route factories, and a couple of pure helpers — never a
`mongoose.connect(...)` call, a hardcoded DB name, or a `require(...)` that
reaches into `backend/` or any other consuming app. Everything an app-specific
concern (error formatting) needs is passed in via `ctx`. The one exception is
`modules/auth.js` deliberately being the *source* of RBAC rather than a
consumer of it (see its own header comment and the `ctx` contract above) —
that's a conscious inversion, not a violation of this rule.
