# @duck-hack/core-api

Backend modules (routes + Mongoose models) shared across every store's
independently-deployed backend (the reasoning behind this — each store keeps
its own backend/DB/deploy, but a module's *code* lives here once so every
store's backend can mount it — is recorded as an ADR in the project's Obsidian
vault, not in this repo).

## Modules in this package

- `modules/auth.js` — users, auth, RBAC (`/api/users/*`). Special: besides
  the standard `{name, registerRoutes, models}`, it also exports `auth`
  (`createAuthMiddleware`, `isValidRole`, `ROLES`, `STAFF_ROLES`,
  `validateJwtEnvConfig`) — `index.js` re-exports this at the top level. It's
  the *source* of RBAC for the whole app now, not a consumer of it.
- `modules/mail.js` — contact-form email (`POST /api/mail/send-email`).
- `modules/storeConfig.js` — store branding/content, singleton per deployment
  (`/api/store-config/*`, including the public `GET /public` the storefront
  reads). Content is generic for any kind of store: pricing plans list their
  own `features` (`[{ name, value }]`, like `Product.attributes`) instead of
  the old hosting fields `storage`/`emailAccounts`/`bandwidth`/`ssl` — a
  payload that still sends those gets them converted on save; stores with old
  plans run `backend/scripts/migrate-pricing-plan-features.mongo.js` once.
- `modules/categories.js` — catalog categories (`/api/categories`), with
  image, `featured`, `sortOrder` and a `slug` (what the app home sections and
  `?category=` use). `kind` = `product` or `service`; not a module of its
  own — permissions follow the kind (`products` / `services`). Mounted before
  products and services (both ref `Category`).
- `modules/services.js` — service catalog (`/api/services`, permission key
  `services`, sellable without appointments): category (kind `service`),
  duration, buffer (free time after), price / "from" price, image,
  `bookableOnline`, `deposit` (stored now, charged with the SPEI deposits).
  Public `GET /public` (active, ordered by category then service, no
  deposit/buffer). `GET /public/:id/media` lists the photos/videos of
  appointments with that service whose customer gave `mediaConsent` (path +
  kind only, newest first, missing files skipped) — the storefront's service
  page gallery. A service used in appointments can't be deleted (409).
  Appointments with several services add up the durations and keep the
  largest buffer.
- `modules/appointments.js` — appointments (`/api/appointments`, permission
  key `appointments`). So far (phase 2.2): `Specialist` (services, weekly
  shifts, color, optional link to a collaborator/store_admin account),
  `TimeBlock` (blocked time for one specialist or the whole business) and the
  `AppointmentSettings` singleton (auto-confirm, slot step, min notice, max
  days ahead, change policy, "any specialist", timezone, notify email).
  Business hours/holidays still come from StoreConfig. Specialists, settings
  and business-wide blocks are manager-only (super_admin/store_admin); a
  collaborator only sees the specialist linked to her account and blocks her
  own time. Public: `GET /specialists/public?services=` and
  `GET /settings/public`.
  Engine (2.3): `Appointment` (1–5 services with one specialist, back to
  back: duration = sum, buffer = largest, total = sum; `blockedUntil` = end +
  buffer), availability in `lib/availability.js` (pure functions: business
  hours ∩ specialist shifts − holidays − appointments − blocks, slot step,
  min notice, max days ahead; timezone via Intl). `GET /availability`
  (`date` → slots, `from`/`to` → days with room), `POST /public` (optional
  customer Bearer; "any" picks the least busy specialist; a per-specialist
  expiring lock + re-check inside it prevents double booking — no
  transactions needed), guest access with the `appointment_access` JWT
  (`X-Appointment-Token`, valid until 30 days after the appointment),
  `GET /public/:id`, `POST /public/:id/cancel|reschedule` (policy
  `minHoursToChange`) and `GET /mine`.
  Staff agenda (2.4): `GET /?from=&to=` (FullCalendar range, max 62 days),
  `POST /` manual booking (phone/walk-in; no notice/step limits, any active
  service; outside hours or over a block → `409 OUTSIDE_HOURS`, service the
  specialist doesn't do → `409 SPECIALIST_DOESNT_DO_SERVICE`, both
  overridable with `force: true`; overlapping another appointment → never),
  `GET/PUT /:id` (reschedule, specialist, services, status, contact, notes;
  the slot is re-checked only when time/specialist/services change or a
  cancelled one is reactivated). A collaborator only sees and edits her own
  specialist's appointments.
  Emails (2.5): to the customer on booked / confirmed / rescheduled /
  cancelled, with an `.ics` attachment (`lib/ics.js`: stable UID per
  appointment, SEQUENCE bumps on each reschedule/cancel, `METHOD:CANCEL`
  when cancelled, 1 h alarm) and a Google Calendar link; the "Ver mi cita"
  link is `FRONTEND_URL/cita/<id>?token=…` — every storefront that sells
  appointments must implement that route (reads `GET /public/:id` with
  `X-Appointment-Token`). Business notice (to `notifyEmail` → StoreConfig
  `contactEmail` → `CONTACT_EMAIL_TO`) when the customer books, cancels or
  reschedules; optional `ADMIN_URL` adds an "Abrir la agenda" button.
  Toggles `emailCustomer` / `emailBusiness` in settings; staff can skip one
  change with `notifyCustomer: false`. Fire-and-forget, never fails the request.
  Reminders (3.2, permission key `reminders`, sellable apart): the module's
  `registerJobs` adds an "appointment-reminders" job (every minute) that
  emails confirmed appointments with an email `reminderHoursBefore` (24)
  hours before, once (`claimEach` on `reminderSentAt`), skipping
  appointments booked/moved inside that window (`scheduledAt`). The email's
  CTA goes to `FRONTEND_URL/cita/<id>?token=…&accion=confirmar`; the
  storefront page calls `POST /public/:id/confirm-attendance`
  (`attendanceConfirmedAt`). Rescheduling resets reminder + confirmation. Runs
  only if `reminders` and `appointments` are contracted
  (`lib/permissions.js#isModuleContracted`) and `reminderEnabled`.
  Review requests (4.2): an "appointment-review-requests" job (every 15 min)
  emails `completed` appointments with an email `reviewRequestHoursAfter` (2)
  hours after they end (and less than 14 days ago), once
  (`reviewRequestSentAt`), with `FRONTEND_URL/cita/<id>?token=…&accion=calificar`
  — skipped if the appointment was already reviewed. Runs only if `reviews`
  and `appointments` are contracted and `reviewRequestEnabled`.
  SPEI deposit (5.1): when the booked services ask for one (`Service.deposit`,
  fixed or % of the price) and the store has an SPEI account (first active
  SPEI payment method, else `speiPayment` — `lib/emailTemplates.js
  #storeSpeiAccount`), a site booking enters `pending_deposit` with
  `depositAmount` and `depositDueAt` (now + `depositHours`, never later than
  `depositCutoffHours` before the start; too close → `409 DEPOSIT_TOO_LATE`).
  The customer uploads her proof (`POST /public/:id/deposit-proof`, same
  `lib/paymentProofs.js` engine as orders) → `deposit_review`; staff approves
  (→ `confirmed`, or `pending` without `autoConfirm`) or rejects with a reason
  (→ `pending_deposit` with a new deadline). Both deposit statuses hold the
  slot. An "appointment-deposit-expiry" job (every 5 min) cancels overdue
  `pending_deposit` appointments (`cancelledBy: "system"`) and emails the
  customer and the business. Staff can also book with `requireDeposit`.
  Appointment photos/videos (`media`, up to 30): staff first records that
  the customer allows publishing them (`PUT /:id/media-consent`), then
  `POST /:id/media` uploads through the same pipeline as `/api/media` into
  the **public** media library (titled "Cita #N · customer"); `DELETE
  /:id/media/:fileName` detaches and deletes the file unless something else
  uses it (`lib/mediaUsages.js`). `GET /:id/reviews` returns this
  appointment's review plus the customer's review history (needs `reviews`
  contracted). The customer-facing views never include `media`.
- `modules/products.js` — product catalog (`/api/products`). Optional
  variants (`options` + `variants`, logic in `lib/variants.js`): each variant
  has its own SKU, stock and optional price/image; `lib/purchaseLimits.js
  #filterInStock` resolves them for the public catalog. Public listing
  supports `q`/`category`/`featured`/price/sort/pagination, plus
  `/public/:id/related`.
- `modules/inventory.js` — stock per product, or per product + variant
  (`/api/inventory`). Data from before categories/variants needs
  `backend/scripts/migrate-categories-variants.mongo.js` once per store.
- `modules/orders.js` — orders (`/api/orders`): manual sales from the admin
  and the public checkout. SPEI payment proofs (`lib/paymentProofs.js`, files
  in the private uploads dir) uploaded by staff, the owner, or a guest with
  the `X-Order-Token` returned at checkout; staff approves (→ `confirmed`,
  stock is deducted) or rejects with a reason. Status `payment_review` sits
  between `pending` and `confirmed`. Stock follows the status
  (`syncInventoryForOrder`, `Order.inventoryDeducted`): deducted on entering
  any paid-or-later status, returned on going back to pending/payment_review/
  cancelled or deleting the order (atomic flag, no double deduction). `shipment` (carrier/tracking) and status
  emails to the customer, gated by `StoreConfig.orderNotifications`. With
  `StoreConfig.customerProofUpload` on, the confirmation email links to the
  storefront's order page `FRONTEND_URL/pedido/<id>?token=…`, which reads
  `GET /:id/summary` (and the ticket `GET /:id/pdf`) with `X-Order-Token` —
  every storefront that turns it on must implement that route.
- `lib/validationMessages.js` — `describeValidationError(error)` turns a
  Mongoose `ValidationError` into Spanish, per-field messages (`required`,
  `maxlength` with the current length, `min`/`max`, `enum`, cast errors;
  custom validator messages kept as-is). Used by
  `moduleHelpers#handleMongooseError`, `modules/auth.js` and, through the
  package's `validation` export, `backend/`'s routers.
- `lib/phone.js` — Mexican phones, 10 digits: `normalizeMxPhone` (strips
  separators and a 52/521 prefix), `parseMxPhone(value, { required, label })`
  → `{ value }` | `{ error }`, `toWhatsappPhone` (stores 52 + 10). Used by
  every module that stores a phone, and exported as `phone` for `backend/`.
- `modules/coupons.js` — discount coupons (`/api/coupons`, permission key
  `coupons`): amount / percent / free shipping, minimum purchase, validity
  window, total and per-customer use limits. Rules in `lib/coupons.js`
  (`resolveCoupon` for both the public `POST /validate` preview and the
  checkout's `couponCode`; uses reserved atomically at checkout and released
  when the order is cancelled or deleted, `Order.discount.counted`).
- `modules/reviews.js` — product reviews (`/api/reviews`, moderation under
  permission key `reviews`). Generic `Review` model (`target.kind` "product" or
  "appointment"). A logged-in
  customer can review a product once they have a `delivered`/`picked_up`
  order containing it (linked account or same email, like `GET
  /api/orders/mine`); one review per customer and product, editable (goes
  back to pending). Everything enters `pending`; approving/unpublishing/
  deleting recalculates `Product.ratingAvg`/`ratingCount` (read-only fields,
  ignored in product payloads). Public `GET /public?product=` shows approved
  only, with a short name ("Ana G.") and a 1–5 distribution; `?service=`
  does the same with the approved post-appointment reviews of appointments
  that included that service (each with the `services` done).
  `GET /mine` (customer's profile) lists her product reviews (by account)
  and her post-appointment reviews (by account **or email**, since guests
  review from the email link), each with `kind` plus `productName` or
  `appointment` (number, services, start).
  Post-appointment reviews (4.2): `GET /appointment/:id` + `POST /appointment`
  with the appointment's `X-Appointment-Token` (guest) or the owner's session;
  only `completed` appointments, one review per appointment (partial unique
  index), `customer` = the linked account or the one with the same email
  (null for guests), snapshot in `appointmentInfo`. Staff list takes
  `?kind=`; `POST /:id/testimonial` copies an approved review to
  `StoreConfig.testimonials` (`fromReview`, conditional `$push` — never
  twice).
- `modules/cart.js` — server-side cart for logged-in users (`/api/cart`,
  GET/PUT/DELETE; no permission key, everyone has their own). PUT replaces
  the whole cart (duplicates merged, max 50 lines); lines come back with the
  product exactly as `/api/products/public` returns it, and what can't be
  bought today goes in `unavailable` (the stored cart keeps it).
  `itemsUpdatedAt` only moves when products/quantities change — it's what the
  abandoned-cart job (3.4) measures. Logged-in checkout calls
  `settleCartAfterOrder`: empties the cart and, if a reminder was sent in the
  last 7 days (and not already counted), records the recovered sale
  (`recoveredAt`/`recoveredOrder`/`recoveredTotal`).
  Abandoned cart (3.4, permission key `abandonedCart`): `registerJobs` adds
  an "abandoned-carts" job (every 15 min) — runs only if contracted and
  `enabled` (`AbandonedCartSettings`: `delayHours`, optional `coupon`). One
  email per abandonment (`claimEach` on `reminderClaimedAt`, cleared when the
  cart changes) to verified customers that haven't opted out
  (`User.emailPreferences.abandonedCart`), for carts idle `delayHours` and
  under 7 days old; current prices, out-of-stock lines skipped (all out of
  stock → no email). Optional generated coupon `VUELVE-XXXXXX`: single use,
  personal (`Coupon.customerEmail` — `lib/coupons.js` answers
  `403 COUPON_NOT_FOR_YOU` to anyone else), `source: "abandoned_cart"`;
  deleted if the email fails. Unsubscribe link → `GET /unsubscribe?token=`
  (HTML page with a POST button, so link scanners can't unsubscribe anyone;
  JWT `email_preferences`). Admin: `GET/PUT /abandoned/settings`,
  `GET /abandoned/stats`.
- `modules/giftCards.js` — gift cards (`/api/gift-cards`, permission key
  `giftCards`, Fase 5.2): peso balance spent in parts. Bought on the site →
  `pending_payment` with SPEI data (proof upload with `X-Gift-Card-Token` or
  the buyer's session, same `lib/paymentProofs.js` engine); staff approves →
  `active` (validity from that day) and the recipient gets the card by email
  with a PDF (`ctx.generateGiftCardPdf`, `backend/utils/giftCardPdf.js`);
  counter sales are active right away. Spent at checkout (`giftCardCode` in
  `POST /api/orders/public`, refunded if the order is cancelled), at the
  counter (`POST /redeem` by code, also allowed to `appointments`/`orders`
  staff) or for an appointment deposit. Shared logic (codes, atomic
  debit/credit, `syncOrderGiftCard`) in `lib/giftCards.js`; daily
  "gift-card-expiry" job.
- `modules/reports.js` — reports (`/api/reports`, permission key `reports`,
  Fase 5.3): `GET /summary?from&to&groupBy` (sales, appointments, gift cards,
  loyalty — each null if its module isn't contracted; aggregated in JS over a
  ≤366-day range) and `GET /export?type=orders|appointments` (CSV with BOM).
- `modules/dashboard.js` — the admin's "Inicio" (`/api/dashboard`), free for
  every store (no permission key of its own): `GET /summary` only returns the
  sections whose source module the role has (pending tasks, sales at a
  glance, today's appointments — a collaborator only her specialist's —,
  latest orders, low stock, gift card/loyalty balances); `GET/PUT
  /preferences` stores `User.dashboardPreferences` (hidden/ordered widgets,
  welcome dismissed, last changelog entry read). Sales figures come from
  `lib/reportQueries.js`, shared with `modules/reports.js`.
- `modules/promoBanners.js` — promo banners (`/api/promo-banners`,
  permission key `promoBanner`): title, text, image (+ optional mobile
  image), button with a `target` (none / product category / coupon / URL),
  `startsAt`/`endsAt`, `isActive`, `sortOrder`, `placement` home/shop/all.
  Public `GET /public?placement=` returns active, in-date banners with the
  target resolved (category slug, coupon code + label); a banner whose target
  no longer works (category deleted/hidden; coupon off, expired, exhausted,
  not started or personal) is hidden, so a coupon the checkout would reject is
  never advertised. Staff CRUD + `GET /options` (categories and advertisable
  coupons, without needing Products/Coupons permissions); the list shows
  `status` (active/scheduled/expired/off) and `targetProblem`. Images go
  through the media picker (`promoBanner` may use it).
- `modules/wishlist.js` — back-in-stock notice for favorites
  (`/api/wishlist`, permission key `wishlist`). A "wishlist-back-in-stock"
  job (every 15 min; only if contracted and `WishlistSettings.enabled`,
  default true) checks only products someone has in `User.favorites` and
  keeps `ProductStockState` (available = active + in stock, the
  `filterInStock` rule; the first run only records). On an out-of-stock →
  available transition (atomic state flip) it creates one `WishlistNotice`
  per verified fan (unique customer + product + restock) and sends them with
  `claimEach` (`sentAt`); skipped (`skipped`) if they unsubscribed, removed
  the favorite or it sold out again. Unsubscribe link → `GET/POST
  /unsubscribe` (JWT `email_preferences`, pref "wishlist" →
  `User.emailPreferences.wishlist`). Button goes to
  `FRONTEND_URL/tienda/<productId>`. Admin: `GET/PUT /settings`,
  `GET /stats` (30-day notices, most favorited products with stock).
- `modules/loyalty.js` — loyalty (`/api/loyalty`, permission key `loyalty`),
  one engine with two programs, each with its own switch in
  `LoyaltySettings`: **points** (wallet in pesos, 1 point = $1) and **stamps**
  (card per completed appointment). Shared logic in `lib/loyalty.js`, called
  from `orders.js` and `appointments.js`; a program only runs if `loyalty` is
  contracted *and* enabled (`isProgramActive`). Points: credited when an order
  reaches a paid status (`earnPercent`, 5% default, over products − coupon −
  points used, no shipping), reversed if it leaves them or is deleted
  (`Order.loyalty.earnedCounted`, atomic); guest orders with an account's
  email count too. Checkout `usePoints` (session only) is capped by
  `maxRedeemPercent`/`minRedeem` and reserved atomically (`$inc` conditioned
  on the balance — no double spend), refunded on cancel/delete and charged
  again if the order is reactivated. Stamps: +1 when an appointment becomes
  `completed` (staff `PUT`, `loyaltyStampCounted`), −1 if it stops being; at
  `goal` → `rewardsAvailable +1` + "¡Completaste tu tarjeta!" email; the
  reward (free text) is redeemed in the admin. Every change writes a
  `LoyaltyLedger` entry; balances never go below 0. Optional expiry
  (`expiryMonths` without activity, default never): daily "loyalty-expiry"
  job warns `expiryWarningDays` before and then zeroes the balance. Routes:
  `GET /me`; staff `GET/PUT /settings`, `GET /accounts?q=`,
  `GET /accounts/:customerId`, `POST /accounts/:customerId/adjust`,
  `POST /accounts/:customerId/redeem-reward`; `GET /lookup` (also for
  `appointments`/`orders` users — agenda dialog and order detail).
- `modules/media.js` — admin media library over the `uploads/` folder
  (`/api/media`): lists files from disk, uploads images/GIF/MP4/WebM, edits
  title + alt text (stored in the `Media` collection, the file itself is never
  renamed), and deletes with a usage check (`lib/mediaUsages.js`:
  Product/User/StoreConfig/AppHome/Appointment).
  Files can be flagged `inGallery` (+ free `galleryCategory`) for the public
  portfolio at `GET /api/media/public`.
- `modules/permissions.js` — per-store permissions (`/api/permissions`):
  which modules the store contracted and what `store_admin`/`collaborator`
  may use; `super_admin` always sees everything. The logic lives in
  `lib/permissions.js`, whose `createModuleAuthorizer({ mongooseConnection,
  sendError })` every staff route uses (`authorizeModule`,
  `authorizeModuleAccess`, `authorizeSelfOrModule`, `hasModule`); `index.js`
  re-exports it as `permissions` for `backend/routes/*`. A new admin module
  must be added to `PERMISSION_MODULES`/`DEFAULT_PERMISSIONS` and guard its
  routes with the authorizer instead of `authorizeRoles`.
- `modules/appHome.js` — the mobile app's home screen as server-driven JSON
  (`/api/app-home/*`), singleton per deployment like StoreConfig. `GET`/`PUT /`
  need the `appConfig` permission module (by default only `super_admin`); `GET /public` returns the
  visible sections with product carousels already resolved (active + in stock,
  `lib/purchaseLimits.js#filterInStock`). Sections are validated against a
  type catalog: own content (banner, productCarousel, categoryGrid, notice)
  or `store*` types that reuse StoreConfig's hero/metrics/commands/services/
  plans/FAQs/team/testimonials (resolved in `/public`, live metrics via
  `lib/liveMetrics.js`).

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

Optional: `registerJobs(scheduler, ctx)` for scheduled tasks (reminders,
abandoned carts…). `backend/server.js` creates one scheduler
(`lib/scheduler.js#createScheduler`), calls `registerJobs` on every module
that has it with the same `ctx` as `registerRoutes`, and starts it once Mongo
connects. Inside, `scheduler.register(name, everyMs, async ({ now }) => …)`:
a job never overlaps itself, a failing job is logged and doesn't stop the
others, nothing runs while Mongo is down. To send each notice exactly once
(even across restarts) use `claimEach({ Model, filter, markField,
attemptsField, handle })`: it marks the document atomically before
`handle` runs, and on failure clears the mark and counts the attempt (stops
at 3). Env: `SCHEDULER_ENABLED` (default true; `false` for tests or if a
store ever runs more than one backend instance) and `SCHEDULER_TICK_MS`
(default 60000); tests only: `SCHEDULER_JOB_INTERVAL_MS` overrides every
job's interval. Send notices through `lib/notify.js#notify({ channel,
to, … })` — only `email` today; WhatsApp/SMS plug in with `registerChannel`
when a provider is contracted (until then `NOTIFY_CHANNEL_NOT_CONFIGURED`).

Jobs registered today (each checks its own permission key with
`isModuleContracted`, since there's no user to authorize):

| Job | Module | Every | Runs if contracted |
| --- | --- | --- | --- |
| `appointment-reminders` | appointments | 1 min | `reminders` + `appointments` |
| `appointment-review-requests` | appointments | 15 min | `reviews` + `appointments` |
| `appointment-deposit-expiry` | appointments | 5 min | `appointments` |
| `abandoned-carts` | cart | 15 min | `abandonedCart` |
| `wishlist-back-in-stock` | wishlist | 15 min | `wishlist` |
| `loyalty-expiry` | loyalty | 24 h | `loyalty` (+ points with `expiryMonths`) |
| `gift-card-expiry` | giftCards | 24 h | `giftCards` |

Customer-facing links these jobs put in emails are a contract every storefront
that sells the feature must serve: `FRONTEND_URL/cita/<id>?token=…`
(`&accion=confirmar` / `&accion=calificar`), `FRONTEND_URL/carrito`,
`FRONTEND_URL/tienda/<productId>`, `FRONTEND_URL/tarjeta-regalo/<id>?token=…`
(gift card purchase page); unsubscribe links point to the backend
(`BACKEND_PUBLIC_URL/api/cart|wishlist/unsubscribe`).

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
  ROLES,                        // { SUPER_ADMIN, STORE_ADMIN, COLLABORATOR, CUSTOMER }
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
