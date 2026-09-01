# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Duck-Hack Cloud is a CRM/eCommerce base: a Node/Express/MongoDB/JWT backend plus two separate React frontends (an admin panel and a public storefront). It's deployed **single-tenant per instance** (one backend + one Mongo DB per client) — that's the committed direction, not a transitional state; see "Multi-store strategy" below for how modules get reused across stores without a shared multi-tenant backend.

## Commands

### Install
```bash
cd backend && npm install
cd frontend-admin && npm install
cd frontend-user && npm install
```

### Run locally (no Docker)
```bash
cd backend && npm start                 # http://localhost:5000, reads backend/.env
cd frontend-user && npm start           # Vite dev server on http://localhost:3000
cd frontend-admin && npm start          # Vite dev server on http://localhost:3001 (port set in vite.config.js)
```

### Run with Docker Compose
```bash
cp .env.example .env   # set STORE_SLUG (unique per store/clone) — required
docker compose up --build
```
`docker-compose.yml` derives the Compose project name, every `container_name` (`<STORE_SLUG>.backend` / `.frontend-admin` / `.frontend-user`), the internal networks and the uploads volume (`<STORE_SLUG>.backend-uploads`) from `STORE_SLUG` in the root `.env` (gitignored via `*.env`). This is what lets the repo be cloned once per store on the same host without name collisions; `compose up` fails fast if `STORE_SLUG` is unset. The pre-existing store must use `STORE_SLUG=duck-hack` to keep its historical volume/data. NPM proxy hosts target those container names on the `npm` network.

Containers expose: frontend-admin `8080`, frontend-user `8080`, backend `5000` (no host port mappings — traffic reaches them through the external `npm` / nginx-proxy-manager network). The frontends run `nginxinc/nginx-unprivileged` (nginx as a non-root user, hence port `8080` not `80`) — if you change this, update the "Forward Port" of each proxy host in NPM. There is **no Mongo container** — point `MONGO_URL_GLOBAL` at a reachable Mongo (use `host.docker.internal` on macOS for a host-local instance). The compose file also joins an **external** `npm` network (nginx-proxy-manager); that network must already exist (`docker network create npm`) or `docker compose up` fails.

### Tests
- Backend: no test suite (`npm test` is a stub that exits 1). Manual verification is via `backend/scripts/bl014-smoke-tests.sh`, a curl-based smoke test hitting a running server — configure via env vars (`BASE_URL`, `CUSTOMER_TOKEN`, `STAFF_TOKEN`, `CUSTOMER_ID`, etc.), see the script header for usage.
- Frontends: `cd frontend-admin|frontend-user && npm test` runs Vitest once (`vitest run`); `npm run test:watch` for watch mode. Only one smoke test exists (`src/App.test.jsx`) in each — no real coverage yet. Test env is jsdom, setup in `src/setupTests.js`.
- No standalone lint command. CRA's built-in `react-app` eslint went away with the Vite migration — Vite does not lint during `dev`/`build`. Add ESLint explicitly if you want it back.

### Env setup
```bash
cp backend/.env.example backend/.env
cp frontend-admin/.env.example frontend-admin/.env
cp frontend-user/.env.example frontend-user/.env
```
The backend **throws at startup** (won't boot) if `MONGO_URL_GLOBAL`, `CORS_ALLOWED_ORIGINS`, or any of the `JWT_*` vars are missing/invalid — `JWT_SECRET` must be ≥32 chars (see `server.js` and `utils/jwt.js#validateJwtEnvConfig`).

## Architecture

### Three independently deployable apps, one repo
- `backend/` — Express API, Mongoose/MongoDB, JWT auth + RBAC.
- `frontend-admin/` — React admin panel (`HashRouter`), used by staff roles.
- `frontend-user/` — React public storefront (`BrowserRouter`), used by customers.

Each has its own `package.json`, `Dockerfile`, and `.env.example`, and each is still deployed as a fully independent instance per client/store (own backend, own DB, own containers — see "Multi-store strategy" below). A change to an API shape typically means editing the backend and both frontends separately.

The repo root also has a `package.json` declaring npm **workspaces** (`backend`, `frontend-admin`, `frontend-user`, `packages/*`) — this exists solely to let the three apps consume shared internal packages under `packages/`, not to change how they're deployed; each app keeps building/running from its own folder exactly as before.

### Multi-store strategy: separated backends + shared packages (see `docs/adr-monorepo-shared-packages.md`)
Each store/client gets its own independently deployed `backend` + DB + frontends (as today) — there is **no** shared multi-tenant backend process. To let a new module (e.g. billing) be reused by every store without rewriting it per client, reusable module code lives once in versioned internal packages and each app imports it:
- `packages/core-api/` — reusable backend modules (routes + Mongoose models); see its `README.md` for the module convention (`{ name, registerRoutes(app, ctx), models }`) that `backend/server.js` mounts, and for which modules live there today (auth, mail, uploads, storeConfig, products, inventory, orders — everything customer-facing/per-store) vs. what's staying in `backend/` permanently (AgencyClient/Accounting/Invoices/Infra — Duck-Hack's own internal agency-management tooling, not a per-store feature, not a candidate to move here).
- `packages/ui-kit/` — React components shared between `frontend-admin` and `frontend-user`.

This **supersedes** the "Modelo B" shared-multi-tenant-backend proposal in `docs/notion-architecture-v1-hibrida.md` (that doc is kept for history, marked superseded at its top). See "Tenant/multi-store infrastructure" below — the partial Modelo B infra that used to live here has been removed from the codebase entirely, not just deprecated.

**Branching model** (see README.md, "Publicar tiendas: flujo de ramas" for the full
workflow): `main` is canonical — all shared development happens here. Each deployed
store runs from its own `release-<store-domain>` branch, merged **only** `main →
release-*`, never the other way and never `release-* → release-*`. Don't merge a
`release-*` branch into `main`, and don't put shared-feature work directly on a
`release-*` branch — it belongs on `main` first.

### Backend request pipeline (`backend/server.js`)
Middleware order: `express.json()` → CORS (allow-list built from `CORS_ALLOWED_ORIGINS`; throws at boot if empty) → `helmet` (CSP disabled — this is an API-only backend, CSP is the frontends' concern) → routers mounted at `/api/agency-clients`, `/api/infra`, `/api/accounting`, `/api/invoices` (the pieces that stayed in `backend/`) → `@duck-hack/core-api` modules mounted via `coreApiModules.forEach(...)` (`/api/users`, `/api/mail`, `/api/uploads`, `/api/store-config`, `/api/products`, `/api/inventory`, `/api/orders`) → static `/uploads` → CORS-error handler → generic error handler → 404 handler.

All error responses flow through `utils/httpResponses.js#sendError`, producing the uniform shape:
```json
{ "ok": false, "error": { "status": 400, "code": "VALIDATION_ERROR", "message": "..." } }
```
Match this convention (`status` + machine-readable `code` + human `message`) for any new endpoint.

### Auth & RBAC (`packages/core-api/modules/auth.js`, `packages/core-api/lib/authMiddleware.js`, `packages/core-api/lib/jwt.js`)
Moved here from `backend/` along with StoreConfig — see "Multi-store strategy" above. `packages/core-api/index.js` re-exports this module's `auth` object (`{createAuthMiddleware, isValidRole, ROLES, STAFF_ROLES, validateJwtEnvConfig}`); anything in `backend/` that still needs RBAC (`agencyClient.routes.js`, `accounting.routes.js`, `invoices.routes.js`, `infra.routes.js`, `validationMiddleware.js`) does `const { auth } = require("@duck-hack/core-api")`, then `auth.createAuthMiddleware(sendError)` to get `{verifyToken, authorizeRoles, authorizeSelf, authorizeSelfOrRoles}` (curried on `sendError` since the package never imports `backend/`'s error formatter directly — same injection pattern as every other module in the package).
- Roles: `super_admin`, `store_admin`, `catalog_manager`, `order_manager`, `customer` (`STAFF_ROLES` = everything but `customer`).
- JWT is HS256 with required issuer/audience/expiry. Two token types (`access`, `email_verification`) are distinguished by a `tokenType` claim so a verification token can't be replayed as an access token.
- Composable middlewares: `authorizeRoles(...roles)`, `authorizeSelf(idParam)`, `authorizeSelfOrRoles(idParam, ...roles)` — chain these after `verifyToken` on route definitions instead of writing ad hoc role checks in handlers.
- `POST /api/users/register` always forces `role: customer` server-side. Role changes only happen via `PUT /api/users/:id` with extra guardrails: no self-promotion, `store_admin` can't view/edit/assign `super_admin`.

### Validation & rate limiting
- `middleware/validationMiddleware.js`: one hand-written `validateXPayload` function per request shape (no Joi/Zod) that trims/normalizes `req.body` in place and calls `next()`. Follow this pattern for new endpoints rather than introducing a schema library. Only what's left in `backend/` lives here now (AgencyClient/Accounting/Invoices) — Auth's and StoreConfig's validators moved with them into their `packages/core-api` module files.
- `packages/core-api/lib/rateLimit.js#createRateLimiter`: in-memory per-IP limiter (keyed off `X-Forwarded-For`/`req.ip`). Resets on process restart and does **not** coordinate across multiple backend instances — fine for single-instance deploys, not for horizontal scaling. `backend/middleware/rateLimitMiddleware.js` is gone — this was its only consumer's replacement (register/login rate limits, in `modules/auth.js`; the contact-form limit already lived here from the Mail move).

### Image uploads (`packages/core-api/lib/uploads.js`)
Multer buffers the upload in memory → `sharp` decodes and re-encodes it (strips unexpected metadata, and rejects anything that isn't actually a JPEG/PNG regardless of the client's declared `Content-Type`) → written to disk under `UPLOADS_DIR` (falls back to `/tmp/media-uploads` if that's not writable). `createSingleImageUploadMiddlewares({ fieldName, filePrefix, maxFileSizeMB, sendError })` is the one factory now used by every image-upload route in the app — profile (`auth.js`), store-config logo/team/testimonial (`storeConfig.js`), and product (`uploads.js`) — all in `packages/core-api`. `backend/middleware/imageUploadMiddleware.js` is gone; `backend/utils/uploads.js` still exists but only for `server.js`'s static `/uploads` serving (`resolveUploadsDir()`), not for the upload pipeline anymore.

### Tenant/multi-store infrastructure (removed)
`docs/notion-architecture-v1-hibrida.md` ("Modelo B": one global admin DB + one DB per store, shared multi-tenant backend) is superseded by `docs/adr-monorepo-shared-packages.md` — see "Multi-store strategy" above for the current direction. The partial Modelo B infra (`utils/dbConnectionManager.js`, `scripts/tenant-bootstrap.mongo.js`, the `TENANT_*` env vars, the `X-Tenant-Slug` header `frontend-user/src/utils/apiClient.js` used to send) was never consumed by any route/model and has been **deleted** from the codebase, not just deprecated — don't look for it. `backend/scripts/storeconfig-bootstrap.mongo.js` is unrelated (it predates Modelo B and seeds the single per-deployment `StoreConfig` doc) and is still the script to use.

Every model — `User`, `StoreConfig`, `Product`, `Inventory`, `Order` (via `packages/core-api/lib/moduleHelpers.js#getOrCreateModel(ctx.mongooseConnection, ...)`) and `AgencyClient`/`Transaction`/`Invoice`/`HostingPayment`/`DesignDebt` (via direct `mongoose.model(...)`, still in `backend/models/`) — registers against the same single per-instance connection opened once in `server.js`. There is no tenant resolver, no `req.tenant`, and none is planned; that's the point of the current direction (see "Multi-store strategy").

`StoreConfig` is a deliberate singleton per deployment (`singletonKey: "default"`, unique + immutable) — the `/api/store-config` routes always read/write that one document.

### Frontend patterns
- Both frontends read the backend base URL from `REACT_APP_HOST_SERVICES_URL` and call it directly — `frontend-admin` uses `axios` inline per-component, `frontend-user` goes through `utils/apiClient.js#apiFetch`, which unwraps the backend's `{ ok, error }` envelope into a thrown `Error(message)`.
- `frontend-admin` gates routes on `localStorage` (`token`, `role`) checked directly against `adminRoles`/`storeConfigRoles` arrays in `App.js` — no auth context/state library.
- `frontend-user` renders most sections (`Inicio`, `AboutUs`, `OurServices`, `Services`, `Customers`, `ContactUs`) together on a single scrolling `"/"` route, plus a few standalone routed pages (`legal-notice`, `privacy-policy`, `users/verify`, `login`, `register`). `react-scroll` + the `ScrollToSection` component in `App.js` handle in-page hash anchors.

### API contract source of truth
`backend/openapi.yaml` documents the live contract. `docs/notion-interface-contracts.md` and `docs/bl-015-api-handbook.md` describe the process for proposing/versioning API changes (Notion-based changelog; `docs/notion-bl015-api-change-template.md` is the change template). Keep `openapi.yaml` in sync when routes change.
