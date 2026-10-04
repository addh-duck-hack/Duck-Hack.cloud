// Lealtad (`/api/loyalty`, clave de permisos `loyalty`; Fase 4.1, Obsidian
// "Fase 4 - Fidelizacion"). Modelos, ajustes, consulta del cliente,
// administración de cuentas y la tarea de vencimiento. La lógica de abonos,
// canjes y sellos vive en lib/loyalty.js (la usan pedidos y citas).
//
// - Puntos (tienda): monedero en pesos. Se abonan al pagarse el pedido y se
//   canjean en el checkout (modules/orders.js, `usePoints`).
// - Sellos (salón): +1 por cita completada (modules/appointments.js); la
//   tarjeta completa deja un beneficio que se canjea en el panel.
// - Vencimiento (opcional, `points.expiryMonths`): tarea diaria que avisa
//   `expiryWarningDays` antes y luego da de baja el saldo.
const express = require("express");
const mongoose = require("mongoose");
const { asTrimmedString, asFiniteNumber, isValidObjectId, getOrCreateModel, handleMongooseError } = require("../lib/moduleHelpers");
const { createModuleAuthorizer } = require("../lib/permissions");
const { notify } = require("../lib/notify");
const { loyaltyExpiryEmailTemplate } = require("../lib/emailTemplates");
const {
  DEFAULT_SETTINGS,
  round2,
  getLoyaltySettings,
  isProgramActive,
  addMovement,
  loadBranding,
} = require("../lib/loyalty");

const LEDGER_REASONS = ["earn", "redeem", "refund", "reverse", "expire", "adjust", "reward", "reward_redeemed"];

const loyaltySettingsSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, immutable: true },
    points: {
      enabled: { type: Boolean, default: DEFAULT_SETTINGS.points.enabled },
      // % de la compra (productos − cupón − puntos usados) que se abona.
      earnPercent: { type: Number, min: 0.1, max: 50, default: DEFAULT_SETTINGS.points.earnPercent },
      // Hasta qué % del subtotal (ya con cupón) se puede pagar con puntos.
      maxRedeemPercent: { type: Number, min: 1, max: 100, default: DEFAULT_SETTINGS.points.maxRedeemPercent },
      // Mínimo de puntos para poder canjear.
      minRedeem: { type: Number, min: 0, default: DEFAULT_SETTINGS.points.minRedeem },
      // Meses sin movimiento para que venzan (null = nunca).
      expiryMonths: { type: Number, min: 1, max: 60, default: null },
      expiryWarningDays: { type: Number, min: 1, max: 60, default: DEFAULT_SETTINGS.points.expiryWarningDays },
    },
    stamps: {
      enabled: { type: Boolean, default: DEFAULT_SETTINGS.stamps.enabled },
      goal: { type: Number, min: 2, max: 50, default: DEFAULT_SETTINGS.stamps.goal },
      reward: { type: String, trim: true, maxlength: 120, default: DEFAULT_SETTINGS.stamps.reward },
    },
  },
  { timestamps: true }
);

const loyaltyAccountSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    points: { type: Number, min: 0, default: 0 },
    stamps: { type: Number, min: 0, default: 0 },
    rewardsAvailable: { type: Number, min: 0, default: 0 },
    // Última compra o canje (lo que mide el vencimiento).
    lastActivityAt: { type: Date, default: Date.now },
    expiryWarnedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
loyaltyAccountSchema.index({ points: -1 });

const loyaltyLedgerSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    program: { type: String, enum: ["points", "stamps"], required: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, default: 0 },
    reason: { type: String, enum: LEDGER_REASONS, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    // Staff que hizo un ajuste manual o canjeó un beneficio.
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
loyaltyLedgerSchema.index({ customer: 1, createdAt: -1 });

// Payload de ajustes (parcial) → { settings } o { error }.
const validateSettingsPayload = (payload) => {
  const out = {};
  const num = (value, min, max, { integer = false, nullable = false } = {}) => {
    if (nullable && (value === null || value === "")) return { value: null };
    const n = asFiniteNumber(value);
    if (n === null || n < min || n > max || (integer && !Number.isInteger(n))) return { error: true };
    return { value: n };
  };
  if (payload.points !== undefined) {
    const p = payload.points || {};
    const points = {};
    if (p.enabled !== undefined) points.enabled = Boolean(p.enabled);
    const rules = [
      ["earnPercent", 0.1, 50, {}, "earnPercent va de 0.1 a 50."],
      ["maxRedeemPercent", 1, 100, {}, "maxRedeemPercent va de 1 a 100."],
      ["minRedeem", 0, 100000, {}, "minRedeem debe ser un número >= 0."],
      ["expiryMonths", 1, 60, { integer: true, nullable: true }, "expiryMonths es un entero de 1 a 60 (o vacío: nunca vencen)."],
      ["expiryWarningDays", 1, 60, { integer: true }, "expiryWarningDays es un entero de 1 a 60."],
    ];
    for (const [field, min, max, opts, message] of rules) {
      if (p[field] === undefined) continue;
      const r = num(p[field], min, max, opts);
      if (r.error) return { error: message };
      points[field] = r.value;
    }
    out.points = points;
  }
  if (payload.stamps !== undefined) {
    const st = payload.stamps || {};
    const stamps = {};
    if (st.enabled !== undefined) stamps.enabled = Boolean(st.enabled);
    if (st.goal !== undefined) {
      const r = num(st.goal, 2, 50, { integer: true });
      if (r.error) return { error: "La meta de sellos es un entero de 2 a 50." };
      stamps.goal = r.value;
    }
    if (st.reward !== undefined) {
      const reward = asTrimmedString(st.reward);
      if (!reward || reward.length > 120) return { error: "Describe el beneficio (máx. 120 caracteres)." };
      stamps.reward = reward;
    }
    out.stamps = stamps;
  }
  return { settings: out };
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const pointsExpireAt = (account, settings) =>
  settings.points.expiryMonths && account?.points > 0
    ? addMonths(account.lastActivityAt || account.createdAt || new Date(), settings.points.expiryMonths)
    : null;

// Lo que ve el cliente de las reglas.
const publicPrograms = async (connection) => {
  const settings = await getLoyaltySettings(connection);
  const [pointsActive, stampsActive] = await Promise.all([isProgramActive(connection, "points"), isProgramActive(connection, "stamps")]);
  return {
    settings,
    programs: {
      points: pointsActive
        ? {
            enabled: true,
            earnPercent: settings.points.earnPercent,
            maxRedeemPercent: settings.points.maxRedeemPercent,
            minRedeem: settings.points.minRedeem,
            expiryMonths: settings.points.expiryMonths,
          }
        : { enabled: false },
      stamps: stampsActive ? { enabled: true, goal: settings.stamps.goal, reward: settings.stamps.reward } : { enabled: false },
    },
  };
};

const ledgerView = (entry) => ({
  _id: entry._id,
  program: entry.program,
  delta: entry.delta,
  balanceAfter: entry.balanceAfter,
  reason: entry.reason,
  order: entry.order,
  appointment: entry.appointment,
  note: entry.note,
  by: entry.by && entry.by.name ? { name: entry.by.name } : entry.by || null,
  createdAt: entry.createdAt,
});

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Settings = getOrCreateModel(mongooseConnection, "LoyaltySettings", loyaltySettingsSchema);
  const Account = getOrCreateModel(mongooseConnection, "LoyaltyAccount", loyaltyAccountSchema);
  const Ledger = getOrCreateModel(mongooseConnection, "LoyaltyLedger", loyaltyLedgerSchema);
  const router = express.Router();
  router.use(verifyToken);

  // ---- Cliente ----
  // Saldo, sellos, beneficios, reglas y últimos movimientos.
  router.get("/me", async (req, res) => {
    try {
      const { settings, programs } = await publicPrograms(mongooseConnection);
      const account = await Account.findOne({ customer: req.user.id }).lean();
      const ledger = account ? await Ledger.find({ customer: req.user.id }).sort({ createdAt: -1 }).limit(20).lean() : [];
      return res.status(200).json({
        programs,
        account: {
          points: round2(account?.points || 0),
          stamps: account?.stamps || 0,
          rewardsAvailable: account?.rewardsAvailable || 0,
          pointsExpireAt: pointsExpireAt(account, settings),
        },
        ledger: ledger.map(ledgerView),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar tus puntos.");
    }
  });

  // ---- Staff (módulo loyalty) ----
  const { authorizeModule } = createModuleAuthorizer({ mongooseConnection, sendError });
  const canManage = authorizeModule("loyalty");
  // La consulta rápida la usan la agenda y el detalle del pedido: basta con
  // tener uno de esos módulos (si lealtad está contratada).
  const canLookup = authorizeModule("loyalty", { alsoBy: ["appointments", "orders"] });

  router.get("/settings", canManage, async (req, res) => {
    try {
      return res.status(200).json(await getLoyaltySettings(mongooseConnection));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar los ajustes de lealtad.");
    }
  });

  router.put("/settings", canManage, async (req, res) => {
    try {
      const { settings, error } = validateSettingsPayload(req.body || {});
      if (error) return sendError(res, 400, "VALIDATION_ERROR", error);
      const set = {};
      for (const program of ["points", "stamps"]) {
        for (const [key, value] of Object.entries(settings[program] || {})) set[`${program}.${key}`] = value;
      }
      await Settings.updateOne({ singletonKey: "default" }, { $set: set }, { upsert: true, runValidators: true });
      return res.status(200).json({ message: "Ajustes de lealtad guardados.", settings: await getLoyaltySettings(mongooseConnection) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al guardar los ajustes de lealtad.");
    }
  });

  // GET /accounts?q= — con q busca clientes por nombre o correo (tengan o no
  // cuenta de lealtad); sin q, los de más saldo.
  router.get("/accounts", canManage, async (req, res) => {
    try {
      const User = mongooseConnection.models.User;
      const q = asTrimmedString(req.query.q).slice(0, 80);
      let users;
      let accounts;
      if (q) {
        const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        users = await User.find({ role: "customer", $or: [{ name: pattern }, { email: pattern }] }).select("name email").limit(30).lean();
        accounts = await Account.find({ customer: { $in: users.map((u) => u._id) } }).lean();
      } else {
        accounts = await Account.find({ $or: [{ points: { $gt: 0 } }, { stamps: { $gt: 0 } }, { rewardsAvailable: { $gt: 0 } }] })
          .sort({ points: -1, stamps: -1 })
          .limit(50)
          .lean();
        users = await User.find({ _id: { $in: accounts.map((a) => a.customer) } }).select("name email").lean();
      }
      const accountBy = new Map(accounts.map((a) => [String(a.customer), a]));
      const userBy = new Map(users.map((u) => [String(u._id), u]));
      const ids = q ? users.map((u) => String(u._id)) : accounts.map((a) => String(a.customer));
      return res.status(200).json({
        items: ids
          .filter((id) => userBy.has(id))
          .map((id) => {
            const a = accountBy.get(id);
            const u = userBy.get(id);
            return { customer: { _id: u._id, name: u.name, email: u.email }, points: round2(a?.points || 0), stamps: a?.stamps || 0, rewardsAvailable: a?.rewardsAvailable || 0 };
          }),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al buscar clientes.");
    }
  });

  const loadCustomer = async (req, res) => {
    if (!isValidObjectId(req.params.customerId)) {
      sendError(res, 400, "INVALID_OBJECT_ID", "customerId no válido");
      return null;
    }
    const user = await mongooseConnection.models.User?.findOne({ _id: req.params.customerId, role: "customer" }).select("name email").lean();
    if (!user) {
      sendError(res, 404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado.");
      return null;
    }
    return user;
  };

  const accountDetail = async (user) => {
    const settings = await getLoyaltySettings(mongooseConnection);
    const account = await Account.findOne({ customer: user._id }).lean();
    const ledger = await Ledger.find({ customer: user._id }).sort({ createdAt: -1 }).limit(100).populate("by", "name").lean();
    return {
      customer: user,
      points: round2(account?.points || 0),
      stamps: account?.stamps || 0,
      rewardsAvailable: account?.rewardsAvailable || 0,
      goal: settings.stamps.goal,
      reward: settings.stamps.reward,
      pointsExpireAt: pointsExpireAt(account, settings),
      ledger: ledger.map(ledgerView),
    };
  };

  router.get("/accounts/:customerId", canManage, async (req, res) => {
    try {
      const user = await loadCustomer(req, res);
      if (!user) return undefined;
      return res.status(200).json(await accountDetail(user));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la cuenta.");
    }
  });

  // Resumen para el diálogo de la cita / el detalle del pedido:
  // ?customer=<id> o ?email=<correo>. Sin cuenta → { found: false }.
  router.get("/lookup", canLookup, async (req, res) => {
    try {
      const User = mongooseConnection.models.User;
      let user = null;
      if (isValidObjectId(req.query.customer)) user = await User.findOne({ _id: req.query.customer, role: "customer" }).select("name email").lean();
      if (!user && req.query.email) user = await User.findOne({ email: String(req.query.email).trim().toLowerCase(), role: "customer" }).select("name email").lean();
      if (!user) return res.status(200).json({ found: false });
      const { programs } = await publicPrograms(mongooseConnection);
      const account = await Account.findOne({ customer: user._id }).lean();
      return res.status(200).json({
        found: true,
        customer: user,
        programs,
        points: round2(account?.points || 0),
        stamps: account?.stamps || 0,
        rewardsAvailable: account?.rewardsAvailable || 0,
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la lealtad del cliente.");
    }
  });

  // Ajuste manual: { program: points|stamps, delta, note } (nota obligatoria).
  router.post("/accounts/:customerId/adjust", canManage, async (req, res) => {
    try {
      const user = await loadCustomer(req, res);
      if (!user) return undefined;
      const program = req.body?.program;
      if (!["points", "stamps"].includes(program)) return sendError(res, 400, "VALIDATION_ERROR", "program debe ser points o stamps.");
      const delta = asFiniteNumber(req.body?.delta);
      if (delta === null || delta === 0 || (program === "stamps" && !Number.isInteger(delta)) || Math.abs(delta) > 100000) {
        return sendError(res, 400, "VALIDATION_ERROR", program === "stamps" ? "Los sellos se ajustan en enteros." : "delta debe ser un número distinto de 0.");
      }
      const note = asTrimmedString(req.body?.note).slice(0, 300);
      if (!note) return sendError(res, 400, "VALIDATION_ERROR", "Escribe el motivo del ajuste.");
      const current = (await Account.findOne({ customer: user._id }).lean())?.[program] || 0;
      if (current + delta < 0) return sendError(res, 409, "INSUFFICIENT_BALANCE", `El cliente solo tiene ${round2(current)}.`);
      await addMovement(mongooseConnection, { customer: user._id, program, delta: round2(delta), reason: "adjust", note, by: req.user.id });
      return res.status(200).json({ message: "Ajuste guardado.", account: await accountDetail(user) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al ajustar la cuenta.");
    }
  });

  // Canjear un beneficio de la tarjeta de sellos (en el salón).
  router.post("/accounts/:customerId/redeem-reward", canManage, async (req, res) => {
    try {
      const user = await loadCustomer(req, res);
      if (!user) return undefined;
      const account = await Account.findOneAndUpdate(
        { customer: user._id, rewardsAvailable: { $gte: 1 } },
        { $inc: { rewardsAvailable: -1 } },
        { new: true }
      ).lean();
      if (!account) return sendError(res, 409, "NO_REWARD_AVAILABLE", "Este cliente no tiene beneficios disponibles.");
      const settings = await getLoyaltySettings(mongooseConnection);
      await Ledger.create({
        customer: user._id,
        program: "stamps",
        delta: 0,
        balanceAfter: account.stamps,
        reason: "reward_redeemed",
        note: asTrimmedString(req.body?.note).slice(0, 300) || `Beneficio usado: ${settings.stamps.reward}`,
        by: req.user.id,
      });
      return res.status(200).json({ message: "Beneficio canjeado.", account: await accountDetail(user) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al canjear el beneficio.");
    }
  });

  app.use("/api/loyalty", router);

  // ---- Tarea programada: vencimiento de puntos ----
  const runExpiry = async ({ now = new Date() } = {}) => {
    if (!(await isProgramActive(mongooseConnection, "points"))) return { skipped: "inactive" };
    const settings = await getLoyaltySettings(mongooseConnection);
    const { expiryMonths, expiryWarningDays } = settings.points;
    if (!expiryMonths) return { skipped: "never_expires" };
    const User = mongooseConnection.models.User;
    const branding = await loadBranding(mongooseConnection);
    const frontend = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
    const result = { warned: 0, expired: 0 };
    const accounts = await Account.find({ points: { $gt: 0 } }).lean();
    for (const account of accounts) {
      const lastActivity = account.lastActivityAt || account.createdAt;
      const expiresAt = addMonths(lastActivity, expiryMonths);
      const user = await User.findById(account.customer).select("name email").lean();
      if (now >= expiresAt) {
        // Solo si no hubo movimiento desde que se leyó (atómico).
        const expired = await Account.updateOne({ _id: account._id, points: account.points, lastActivityAt: account.lastActivityAt }, { $set: { points: 0 } });
        if (expired.modifiedCount !== 1) continue;
        await Ledger.create({ customer: account.customer, program: "points", delta: -round2(account.points), balanceAfter: 0, reason: "expire", note: `Sin movimiento desde ${lastActivity.toISOString().slice(0, 10)}` });
        result.expired += 1;
        if (user?.email) {
          const email = loyaltyExpiryEmailTemplate({ kind: "expired", branding, name: user.name, points: account.points });
          await notify({ channel: "email", to: user.email, ...email }).catch((error) => console.error("Correo de puntos vencidos:", error.message));
        }
      } else if (!account.expiryWarnedAt && now >= new Date(+expiresAt - expiryWarningDays * 24 * 60 * 60 * 1000)) {
        const marked = await Account.updateOne({ _id: account._id, expiryWarnedAt: null, lastActivityAt: account.lastActivityAt }, { $set: { expiryWarnedAt: now } });
        if (marked.modifiedCount !== 1 || !user?.email) continue;
        const email = loyaltyExpiryEmailTemplate({
          kind: "warning",
          branding,
          name: user.name,
          points: account.points,
          expiresOn: new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(expiresAt),
          shopUrl: frontend ? `${frontend}/tienda` : null,
        });
        try {
          await notify({ channel: "email", to: user.email, ...email });
          result.warned += 1;
        } catch (error) {
          // Se reintenta en la siguiente corrida.
          await Account.updateOne({ _id: account._id, expiryWarnedAt: now }, { $set: { expiryWarnedAt: null } });
        }
      }
    }
    return result;
  };
  expiryRunners.set(mongooseConnection, runExpiry);
}

const expiryRunners = new WeakMap();

// Tareas programadas: vencimiento de puntos una vez al día.
function registerJobs(scheduler, ctx) {
  const run = expiryRunners.get(ctx.mongooseConnection);
  if (run) scheduler.register("loyalty-expiry", 24 * 60 * 60 * 1000, run);
}

module.exports = {
  name: "loyalty",
  registerRoutes,
  registerJobs,
  models: { LoyaltySettings: loyaltySettingsSchema, LoyaltyAccount: loyaltyAccountSchema, LoyaltyLedger: loyaltyLedgerSchema },
};
