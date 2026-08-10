# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Duck-Hack Cloud is a CRM/eCommerce base: a Node/Express/MongoDB/JWT backend plus two separate React frontends (an admin panel and a public storefront). It's currently deployed **single-tenant per instance** (one backend + one Mongo DB per client), but the backend already contains infrastructure for a future shared **hybrid multi-tenant** model — see "Tenant/multi-store infrastructure" below before touching models or routes.

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
cd frontend-user && npm start           # http://localhost:3000
cd frontend-admin && PORT=3001 npm start  # http://localhost:3001 (avoid clashing with frontend-user)
```

### Run with Docker Compose
```bash
docker compose up --build
```
Ports: frontend-admin `89`, frontend-user `82`, backend `83`. There is **no Mongo container** — point `MONGO_URL_GLOBAL` at a reachable Mongo (use `host.docker.internal` on macOS for a host-local instance). The compose file also joins an **external** `npm` network (nginx-proxy-manager); that network must already exist (`docker network create npm`) or `docker compose up` fails.

### Tests
- Backend: no test suite (`npm test` is a stub that exits 1). Manual verification is via `backend/scripts/bl014-smoke-tests.sh`, a curl-based smoke test hitting a running server — configure via env vars (`BASE_URL`, `CUSTOMER_TOKEN`, `STAFF_TOKEN`, `CUSTOMER_ID`, etc.), see the script header for usage.
- Frontends: `cd frontend-admin|frontend-user && npm test` (CRA/Jest, watch mode by default). Only the default CRA smoke test exists (`App.test.js`) in each — no real coverage yet.
- No standalone lint command; both frontends lint via CRA's built-in `react-app` eslint config as part of `npm start`/`npm run build`.

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

Each has its own `package.json`, `Dockerfile`, and `.env.example`; there's no monorepo tooling (no workspaces, no shared package). A change to an API shape typically means editing the backend and both frontends separately.

### Backend request pipeline (`backend/server.js`)
Middleware order: `express.json()` → CORS (allow-list built from `CORS_ALLOWED_ORIGINS`; throws at boot if empty) → `helmet` (CSP disabled — this is an API-only backend, CSP is the frontends' concern) → routers mounted at `/api/users`, `/api/mail`, `/api/uploads`, `/api/store-config` → static `/uploads` → CORS-error handler → generic error handler → 404 handler.

All error responses flow through `utils/httpResponses.js#sendError`, producing the uniform shape:
```json
{ "ok": false, "error": { "status": 400, "code": "VALIDATION_ERROR", "message": "..." } }
```
Match this convention (`status` + machine-readable `code` + human `message`) for any new endpoint.

### Auth & RBAC (`middleware/authMiddleware.js`, `utils/jwt.js`)
- Roles: `super_admin`, `store_admin`, `catalog_manager`, `order_manager`, `customer` (`STAFF_ROLES` = everything but `customer`).
- JWT is HS256 with required issuer/audience/expiry. Two token types (`access`, `email_verification`) are distinguished by a `tokenType` claim so a verification token can't be replayed as an access token.
- Composable middlewares: `authorizeRoles(...roles)`, `authorizeSelf(idParam)`, `authorizeSelfOrRoles(idParam, ...roles)` — chain these after `verifyToken` on route definitions instead of writing ad hoc role checks in handlers.
- `POST /api/users/register` always forces `role: customer` server-side. Role changes only happen via `PUT /api/users/:id` with extra guardrails: no self-promotion, `store_admin` can't view/edit/assign `super_admin`.

### Validation & rate limiting
- `middleware/validationMiddleware.js`: one hand-written `validateXPayload` function per request shape (no Joi/Zod) that trims/normalizes `req.body` in place and calls `next()`. Follow this pattern for new endpoints rather than introducing a schema library.
- `middleware/rateLimitMiddleware.js`: in-memory per-IP limiter (`createRateLimiter` factory, keyed off `X-Forwarded-For`/`req.ip`). Resets on process restart and does **not** coordinate across multiple backend instances — fine for single-instance deploys, not for horizontal scaling.

### Image uploads (`middleware/imageUploadMiddleware.js`, `utils/uploads.js`)
Multer buffers the upload in memory → `sharp` decodes and re-encodes it (strips unexpected metadata, and rejects anything that isn't actually a JPEG/PNG regardless of the client's declared `Content-Type`) → written to disk under `UPLOADS_DIR` (falls back to `/tmp/media-uploads` if that's not writable). `createSingleImageUploadMiddlewares({ fieldName, filePrefix, maxFileSizeMB })` is the shared factory used by both the user profile-image and product-image upload routes.

### Tenant/multi-store infrastructure (in progress)
The repo is mid-migration from single-tenant-per-deployment toward a shared model described in `docs/notion-architecture-v1-hibrida.md` ("Modelo B": one global admin DB + one DB per store). Read this before adding tenant-aware behavior:
- `utils/dbConnectionManager.js` implements the target state: per-tenant Mongo connections cached by `dbName`, `getTenantConnection()`/`getTenantModel()` to fetch tenant-scoped models, `resolveDbName({ dbName, slug })` to go from a store slug → `store_<slug>` DB name (usage example in `README.md` under "BE-001").
- However, `models/user.model.js` and `models/storeConfig.model.js` still call `mongoose.model(...)` directly against the single global connection opened once in `server.js` — they are **not yet** wired through `dbConnectionManager`. There is no `tenantResolver` middleware yet and no `req.tenant`.
- `StoreConfig` is a deliberate singleton per deployment (`singletonKey: "default"`, unique + immutable) — the `/api/store-config` routes always read/write that one document.
- `frontend-user/src/utils/apiClient.js` already derives a tenant slug (from `REACT_APP_STORE_SLUG` or the hostname's subdomain) and sends it as `X-Tenant-Slug`, anticipating tenant resolution the backend doesn't consume yet.
- `backend/scripts/tenant-bootstrap.mongo.js` and `backend/scripts/storeconfig-bootstrap.mongo.js` are `mongosh` scripts for provisioning a new tenant/store document — see README.md for invocation examples.

When adding tenant-aware behavior, decide explicitly whether it should use the `dbConnectionManager` pattern (target state) or the legacy direct-`mongoose.model` pattern (what `User`/`StoreConfig` still use) — don't silently mix both for the same collection.

### Frontend patterns
- Both frontends read the backend base URL from `REACT_APP_HOST_SERVICES_URL` and call it directly — `frontend-admin` uses `axios` inline per-component, `frontend-user` goes through `utils/apiClient.js#apiFetch`, which unwraps the backend's `{ ok, error }` envelope into a thrown `Error(message)`.
- `frontend-admin` gates routes on `localStorage` (`token`, `role`) checked directly against `adminRoles`/`storeConfigRoles` arrays in `App.js` — no auth context/state library.
- `frontend-user` renders most sections (`Inicio`, `AboutUs`, `OurServices`, `Services`, `Customers`, `ContactUs`) together on a single scrolling `"/"` route, plus a few standalone routed pages (`legal-notice`, `privacy-policy`, `users/verify`, `login`, `register`). `react-scroll` + the `ScrollToSection` component in `App.js` handle in-page hash anchors.

### API contract source of truth
`backend/openapi.yaml` documents the live contract. `docs/notion-interface-contracts.md` and `docs/bl-015-api-handbook.md` describe the process for proposing/versioning API changes (Notion-based changelog; `docs/notion-bl015-api-change-template.md` is the change template). Keep `openapi.yaml` in sync when routes change.
