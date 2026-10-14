// Inicio del admin (`/api/dashboard`): el resumen que ve todo el staff al
// entrar al panel, gratis para todas las tiendas — no tiene clave de
// permisos propia. Cada sección se calcula solo si el rol tiene el módulo de
// donde sale (contratado + permitido, lib/permissions.js#modulesForRole;
// super_admin ve todo), así nadie ve datos de algo que no tiene.
//
// GET /summary → { modules, widgets: { atAGlance, todo, todayAppointments,
//   latestOrders, lowStock, balances } } (solo las permitidas). Mayoreo y
//   Contabilidad de la tienda suman pendientes a `todo` y su saldo a `balances`.
// GET/PUT /preferences → User.dashboardPreferences: tarjetas ocultas, su
//   orden, bienvenida descartada y la última novedad leída del changelog
//   (frontend-admin/src/changelog.js).
//
// Las ventas salen de lib/reportQueries.js, las mismas consultas que Reportes.
const express = require("express");
const { asTrimmedString } = require("../lib/moduleHelpers");
const { STAFF_ROLES, ROLES } = require("../lib/authMiddleware");
const { loadPermissions, modulesForRole } = require("../lib/permissions");
const { DAY, round2, localMidnight, localDate, salesSummary, timezoneOf } = require("../lib/reportQueries");

const MAX_WIDGET_ID = 40;
const MAX_WIDGETS = 30;
const MAX_CHANGELOG_ID = 80;
const MANAGER_ROLES = [ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN];

const validatePreferences = (sendError) => (req, res, next) => {
  const p = req.body || {};
  const out = {};
  for (const field of ["hidden", "order"]) {
    if (p[field] === undefined) continue;
    if (!Array.isArray(p[field]) || p[field].length > MAX_WIDGETS) {
      return sendError(res, 400, "VALIDATION_ERROR", `${field} debe ser una lista de hasta ${MAX_WIDGETS} tarjetas.`);
    }
    const ids = p[field].map((id) => asTrimmedString(id));
    if (ids.some((id) => !id || id.length > MAX_WIDGET_ID || !/^[a-zA-Z0-9_-]+$/.test(id))) {
      return sendError(res, 400, "VALIDATION_ERROR", `${field} tiene un id de tarjeta no válido.`);
    }
    out[field] = [...new Set(ids)];
  }
  if (p.welcomeDismissed !== undefined) out.welcomeDismissed = Boolean(p.welcomeDismissed);
  if (p.changelogSeen !== undefined) {
    const id = asTrimmedString(p.changelogSeen);
    if (id.length > MAX_CHANGELOG_ID) return sendError(res, 400, "VALIDATION_ERROR", "changelogSeen no es válido.");
    out.changelogSeen = id;
  }
  req.body = out;
  return next();
};

const viewPreferences = (prefs) => ({
  hidden: prefs?.hidden || [],
  order: prefs?.order || [],
  welcomeDismissed: Boolean(prefs?.welcomeDismissed),
  changelogSeen: prefs?.changelogSeen || "",
});

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError, authorizeRoles } = ctx;
  const models = () => mongooseConnection.models;
  const router = express.Router();
  router.use(verifyToken, authorizeRoles(...STAFF_ROLES));

  // Módulos que este usuario puede ver.
  const modulesOf = async (role) => modulesForRole(await loadPermissions(mongooseConnection), role);

  // ---- Secciones ----
  const atAGlance = async (tz) => {
    const today = localDate(new Date(), tz);
    const startToday = localMidnight(today, tz);
    const endToday = new Date(+startToday + DAY);
    const monthStartStr = `${today.slice(0, 8)}01`;
    const weekFrom = localDate(+startToday - 6 * DAY + DAY / 2, tz);
    const [todaySales, monthSales, week] = await Promise.all([
      salesSummary(mongooseConnection, { start: startToday, end: endToday, groupBy: "day", tz, from: today, to: today }),
      salesSummary(mongooseConnection, { start: localMidnight(monthStartStr, tz), end: endToday, groupBy: "day", tz, from: monthStartStr, to: today }),
      salesSummary(mongooseConnection, { start: localMidnight(weekFrom, tz), end: endToday, groupBy: "day", tz, from: weekFrom, to: today }),
    ]);
    if (!todaySales) return null;
    return {
      today: { orders: todaySales.orders, revenue: todaySales.revenue, allOrders: todaySales.allOrders },
      month: { orders: monthSales.orders, revenue: monthSales.revenue, avgTicket: monthSales.avgTicket },
      week: week.series.map((p) => ({ period: p.period, revenue: p.revenue, orders: p.orders })),
    };
  };

  const ownSpecialistId = async (req) => {
    if (MANAGER_ROLES.includes(req.user.role)) return null;
    const own = models().Specialist ? await models().Specialist.findOne({ user: req.user.id }).select("_id").lean() : null;
    return own ? own._id : "none";
  };

  const todo = async (allowed, req, tz) => {
    const m = models();
    const items = [];
    const add = (id, label, count, link) => {
      if (count > 0) items.push({ id, label, count, link });
    };
    if (allowed.has("orders") && m.Order) {
      const [review, toShip, toPickUp] = await Promise.all([
        m.Order.countDocuments({ status: "payment_review" }),
        m.Order.countDocuments({ status: { $in: ["confirmed", "processing"] } }),
        m.Order.countDocuments({ status: "ready_for_pickup" }),
      ]);
      add("ordersReview", "Pedidos con comprobante por revisar", review, "/admin/orders");
      add("ordersToShip", "Pedidos por preparar o enviar", toShip, "/admin/orders");
      add("ordersPickup", "Pedidos listos esperando que los recojan", toPickUp, "/admin/orders");
    }
    if (allowed.has("appointments") && m.Appointment) {
      const own = await ownSpecialistId(req);
      if (own !== "none") {
        const scope = own ? { specialist: own } : {};
        const now = new Date();
        const endToday = new Date(+localMidnight(localDate(now, tz), tz) + DAY);
        const [pending, depositReview, depositDue] = await Promise.all([
          m.Appointment.countDocuments({ ...scope, status: "pending", start: { $gte: now } }),
          m.Appointment.countDocuments({ ...scope, status: "deposit_review" }),
          m.Appointment.countDocuments({ ...scope, status: "pending_deposit", depositDueAt: { $lt: endToday } }),
        ]);
        add("appointmentsPending", "Citas por confirmar", pending, "/admin/appointments");
        add("depositsReview", "Anticipos por revisar", depositReview, "/admin/appointments");
        add("depositsDue", "Anticipos que vencen hoy sin pagar", depositDue, "/admin/appointments");
      }
    }
    if (allowed.has("giftCards") && m.GiftCard) {
      add("giftCardsReview", "Tarjetas de regalo con pago por revisar", await m.GiftCard.countDocuments({ status: "pending_payment", "paymentProofs.status": "pending" }), "/admin/gift-cards");
    }
    if (allowed.has("reviews") && m.Review) {
      add("reviewsPending", "Reseñas por moderar", await m.Review.countDocuments({ status: "pending" }), "/admin/reviews");
    }
    if (allowed.has("inventory") && m.Inventory) {
      const [low, out] = await Promise.all([m.Inventory.countDocuments({ status: "low_stock" }), m.Inventory.countDocuments({ status: "out_of_stock" })]);
      add("stockLow", "Productos con poco inventario", low, "/admin/inventory");
      add("stockOut", "Productos agotados", out, "/admin/inventory");
    }
    if (allowed.has("wholesale") && m.WholesaleSale) {
      const [drafts, overdue] = await Promise.all([
        m.WholesaleSale.countDocuments({ status: "draft" }),
        m.WholesaleSale.countDocuments({ status: "delivered", balance: { $gt: 0.004 }, dueDate: { $lt: new Date() } }),
      ]);
      add("wholesaleDrafts", "Ventas de mayoreo por entregar", drafts, "/admin/wholesale/sales");
      add("wholesaleOverdue", "Ventas de mayoreo con pago vencido", overdue, "/admin/wholesale/receivables");
    }
    if (allowed.has("storeAccounting") && m.Purchase) {
      add("purchasesUnpaid", "Compras recibidas sin pagar", await m.Purchase.countDocuments({ status: "received", paidAt: null }), "/admin/finance/purchases");
    }
    return items;
  };

  const todayAppointments = async (req, tz) => {
    const Appointment = models().Appointment;
    if (!Appointment) return null;
    const own = await ownSpecialistId(req);
    if (own === "none") return { timezone: tz, items: [], notLinked: true };
    const start = localMidnight(localDate(new Date(), tz), tz);
    const list = await Appointment.find({ ...(own ? { specialist: own } : {}), start: { $gte: start, $lt: new Date(+start + DAY) }, status: { $ne: "cancelled" } })
      .sort({ start: 1 })
      .limit(50)
      .select("appointmentNumber start end status customerName services specialistName depositAmount")
      .lean();
    return {
      timezone: tz,
      items: list.map((a) => ({
        _id: a._id,
        appointmentNumber: a.appointmentNumber,
        start: a.start,
        end: a.end,
        status: a.status,
        customerName: a.customerName,
        services: (a.services || []).map((s) => s.name),
        specialistName: a.specialistName,
      })),
    };
  };

  const latestOrders = async () => {
    const Order = models().Order;
    if (!Order) return null;
    const list = await Order.find().sort({ createdAt: -1 }).limit(5).select("orderNumber customerName total status createdAt items").lean();
    return list.map((o) => ({ _id: o._id, orderNumber: o.orderNumber, customerName: o.customerName, total: o.total, status: o.status, createdAt: o.createdAt, items: (o.items || []).length }));
  };

  const lowStock = async () => {
    const Inventory = models().Inventory;
    if (!Inventory) return null;
    const list = await Inventory.find({ status: { $in: ["low_stock", "out_of_stock"] } })
      .sort({ quantity: 1 })
      .limit(5)
      .populate("product", "name variants")
      .lean();
    return list
      .filter((i) => i.product)
      .map((i) => {
        const variant = i.variant ? (i.product.variants || []).find((v) => String(v._id) === String(i.variant)) : null;
        return {
          _id: i._id,
          product: i.product._id,
          name: i.product.name + (variant ? ` · ${(variant.optionValues || []).join(" / ")}` : ""),
          quantity: i.quantity,
          status: i.status,
        };
      });
  };

  const balances = async (allowed) => {
    const m = models();
    const out = {};
    if (allowed.has("giftCards") && m.GiftCard) {
      const [row] = await m.GiftCard.aggregate([{ $match: { status: "active" } }, { $group: { _id: null, balance: { $sum: "$balance" }, cards: { $sum: 1 } } }]);
      out.giftCards = { outstanding: round2(row?.balance || 0), activeCards: row?.cards || 0 };
    }
    if (allowed.has("loyalty") && m.LoyaltyAccount) {
      const [row] = await m.LoyaltyAccount.aggregate([{ $group: { _id: null, points: { $sum: "$points" }, accounts: { $sum: { $cond: [{ $gt: ["$points", 0] }, 1, 0] } } } }]);
      out.loyalty = { points: round2(row?.points || 0), accountsWithPoints: row?.accounts || 0 };
    }
    if (allowed.has("wholesale") && m.WholesaleSale) {
      const now = new Date();
      const [row] = await m.WholesaleSale.aggregate([
        { $match: { status: "delivered", balance: { $gt: 0.004 } } },
        { $group: { _id: null, balance: { $sum: "$balance" }, overdue: { $sum: { $cond: [{ $lt: ["$dueDate", now] }, "$balance", 0] } }, customers: { $addToSet: "$customer" } } },
      ]);
      out.wholesale = { receivable: round2(row?.balance || 0), overdue: round2(row?.overdue || 0), customers: row?.customers?.length || 0 };
    }
    return Object.keys(out).length ? out : null;
  };

  router.get("/summary", async (req, res) => {
    try {
      const allowed = new Set(await modulesOf(req.user.role));
      const tz = await timezoneOf(mongooseConnection);
      const has = (key) => allowed.has(key);
      const [glance, todoItems, appts, orders, stock, bal] = await Promise.all([
        has("orders") ? atAGlance(tz) : null,
        todo(allowed, req, tz),
        has("appointments") ? todayAppointments(req, tz) : null,
        has("orders") ? latestOrders() : null,
        has("inventory") ? lowStock() : null,
        balances(allowed),
      ]);
      const widgets = { todo: todoItems };
      if (glance) widgets.atAGlance = glance;
      if (appts) widgets.todayAppointments = appts;
      if (orders) widgets.latestOrders = orders;
      if (stock) widgets.lowStock = stock;
      if (bal) widgets.balances = bal;
      return res.status(200).json({ modules: [...allowed], timezone: tz, widgets });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al armar el resumen.");
    }
  });

  router.get("/preferences", async (req, res) => {
    try {
      const user = await models().User.findById(req.user.id).select("dashboardPreferences").lean();
      return res.status(200).json(viewPreferences(user?.dashboardPreferences));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar tus preferencias.");
    }
  });

  // Solo se cambia lo que viene; lo demás se conserva.
  router.put("/preferences", validatePreferences(sendError), async (req, res) => {
    try {
      const set = Object.fromEntries(Object.entries(req.body).map(([key, value]) => [`dashboardPreferences.${key}`, value]));
      const user = Object.keys(set).length
        ? await models().User.findByIdAndUpdate(req.user.id, { $set: set }, { new: true }).select("dashboardPreferences").lean()
        : await models().User.findById(req.user.id).select("dashboardPreferences").lean();
      return res.status(200).json(viewPreferences(user?.dashboardPreferences));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al guardar tus preferencias.");
    }
  });

  app.use("/api/dashboard", router);
}

module.exports = { name: "dashboard", registerRoutes, models: {} };
