// Citas (`/api/appointments`, clave de permisos `appointments`; Fase 2 del
// Roadmap de cotizaciones, Obsidian "Fase 2 - Citas").
//
// 2.2 — base de la agenda:
// - Specialist: quién atiende, qué servicios hace (modules/services.js) y su
//   horario semanal por turnos. Puede ligarse a una cuenta de staff
//   (`user`): una colaboradora ligada solo ve y mueve su propia agenda.
// - TimeBlock: horarios bloqueados de una especialista o de todo el negocio
//   (`specialist: null`): comida, vacaciones, cursos.
// - AppointmentSettings: singleton con las reglas de la agenda. El horario
//   general y los festivos siguen saliendo de StoreConfig (businessHours,
//   holidays).
//
// 2.3 — motor de citas:
// - Appointment: uno o varios servicios (máx. 5) con la misma especialista,
//   uno detrás de otro. Duración = suma; tiempo entre citas = el mayor de los
//   servicios, una vez al final; total = suma de precios. Se guarda en UTC con
//   `blockedUntil` = fin + tiempo entre citas (lo que ocupa en la agenda).
// - Disponibilidad: lib/availability.js (horario del negocio ∩ especialista −
//   festivos − citas − bloqueos, cada `slotStepMin`, con anticipación mínima
//   y límite de días).
// - Anti-empalme sin transacciones: candado por especialista con vencimiento
//   (`Specialist.bookingLock`); dentro del candado se vuelve a calcular la
//   disponibilidad y se guarda.
// - Clientas: con sesión (customer) la cita queda en su cuenta; sin sesión,
//   la invitada usa el token de la cita (X-Appointment-Token). Cancelar o
//   reprogramar respeta `minHoursToChange`.
//
// 2.4 — agenda del panel: listado por rango (para FullCalendar), alta
// manual (teléfono/mostrador), reprogramar, cambiar estado, servicios y
// notas. El staff no tiene anticipación mínima ni límite de días ni paso;
// fuera del horario o sobre un bloqueo responde 409 OUTSIDE_HOURS y con
// `force: true` lo permite. Empalmada con otra cita, nunca (409 SLOT_TAKEN).
//
// 2.5 — avisos por correo (lib/emailTemplates.js + lib/ics.js): a la clienta
// al agendar, confirmar, reprogramar o cancelar (con .ics y enlace a Google
// Calendar; con enlace a su cita si hay FRONTEND_URL: FRONTEND_URL/cita/<id>
// ?token=…, contrato con cada storefront) y al negocio cuando agenda,
// cancela o reprograma la clienta. Encendidos por default
// (AppointmentSettings.emailCustomer / emailBusiness); el staff puede no
// avisar en un cambio puntual (`notifyCustomer: false`). Best-effort: nunca
// tumban la respuesta.
//
// 3.2 — recordatorios (módulo `reminders`): una tarea programada
// (registerJobs → lib/scheduler.js) manda un correo X horas antes
// (`reminderHoursBefore`) a las citas confirmadas con correo, una sola vez
// (`reminderSentAt` con claimEach), con "Confirmo mi asistencia"
// (FRONTEND_URL/cita/<id>?token=…&accion=confirmar → POST
// /public/:id/confirm-attendance) y "Reprogramar o cancelar". No recuerda
// citas agendadas o movidas dentro de esa ventana (`scheduledAt`); reprogramar
// borra recordatorio y confirmación. Solo corre si `reminders` (y
// `appointments`) están contratados y `reminderEnabled`.
//
// Quién administra: dentro del permiso `appointments`, especialistas,
// ajustes y bloqueos de todo el negocio son de "encargadas" (super_admin y
// store_admin). Una collaborator solo ve su especialista y bloquea su propio
// horario.
const express = require("express");
const mongoose = require("mongoose");
const {
  sanitizeDoc,
  handleMongooseError,
  asTrimmedString,
  asFiniteNumber,
  isValidObjectId,
  getOrCreateModel,
} = require("../lib/moduleHelpers");
const crypto = require("crypto");
const { ROLES, extractBearerToken } = require("../lib/authMiddleware");
const { createModuleAuthorizer, isModuleContracted } = require("../lib/permissions");
const { createRateLimiter } = require("../lib/rateLimit");
const { verifyAccessToken, signAppointmentAccessToken, verifyAppointmentAccessToken } = require("../lib/jwt");
const { normalizeMxPhone } = require("../lib/phone");
const { notify } = require("../lib/notify");
const { claimEach } = require("../lib/scheduler");
const { syncAppointmentStamps } = require("../lib/loyalty");
const { appointmentEmailTemplate, appointmentBusinessEmailTemplate } = require("../lib/emailTemplates");
const { buildIcs, googleCalendarUrl } = require("../lib/ics");
const { MINUTE, isValidDate, addDays, localToUtc, utcToLocal, overlaps, workingWindows, slotsForDay } = require("../lib/availability");

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SHIFTS_PER_DAY = 4;
// Cuentas que se pueden ligar a una especialista (la dueña también puede atender).
const LINKABLE_ROLES = [ROLES.COLLABORATOR, ROLES.STORE_ADMIN];
const MANAGER_ROLES = [ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN];
const MAX_SERVICES_PER_APPOINTMENT = 5;
// Rango máximo de días en una consulta de disponibilidad por calendario.
const MAX_RANGE_DAYS = 62;
const LOCK_MS = 10 * 1000;
const APPOINTMENT_STATUSES = ["pending", "confirmed", "completed", "no_show", "cancelled"];
// Estados en los que la clienta todavía puede cancelar o reprogramar.
const CHANGEABLE_STATUSES = ["pending", "confirmed"];
const PHONE_DIGITS = /^\d{10}$/;

const weeklyShiftSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 0, max: 6 },
    open: { type: String, required: true, match: TIME_PATTERN },
    close: { type: String, required: true, match: TIME_PATTERN },
  },
  { _id: false }
);

const specialistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    photoUrl: { type: String, trim: true, maxlength: 300, default: "" },
    // HTML básico (el storefront lo sanitiza).
    bio: { type: String, trim: true, maxlength: 2000, default: "" },
    // Color en la agenda del panel.
    color: { type: String, trim: true, match: COLOR_PATTERN, default: "#4abdfc" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    services: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }], default: [] },
    // Turnos por día (0 = domingo … 6 = sábado), hora local de la tienda. Un
    // día sin turnos = descanso. Lo que cuenta para agendar es el cruce con el
    // horario del negocio.
    weeklyHours: { type: [weeklyShiftSchema], default: [] },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    // Candado de agendado (ver withSpecialistLock). Lo maneja el servidor.
    bookingLock: {
      token: { type: String, default: null },
      until: { type: Date, default: null },
    },
  },
  { timestamps: true }
);
// Una cuenta, a lo más una especialista.
specialistSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $type: "objectId" } } });
specialistSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const timeBlockSchema = new mongoose.Schema(
  {
    // null = bloquea a todo el negocio.
    specialist: { type: mongoose.Schema.Types.ObjectId, ref: "Specialist", default: null },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 120, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
timeBlockSchema.index({ specialist: 1, start: 1, end: 1 });

const DEFAULT_SETTINGS = Object.freeze({
  autoConfirm: true,
  slotStepMin: 15,
  minNoticeMin: 60,
  maxDaysAhead: 60,
  minHoursToChange: 24,
  allowAnySpecialist: true,
  timezone: "America/Mexico_City",
  notifyEmail: "",
  emailCustomer: true,
  emailBusiness: true,
  reminderEnabled: true,
  reminderHoursBefore: 24,
});

const appointmentSettingsSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, immutable: true },
    // true = la cita entra confirmada; false = "Por confirmar" hasta que el
    // negocio la acepte. En ambos casos el horario queda apartado.
    autoConfirm: { type: Boolean, default: DEFAULT_SETTINGS.autoConfirm },
    // Cada cuánto se ofrecen horarios (10:00, 10:15, …).
    slotStepMin: { type: Number, enum: [5, 10, 15, 20, 30, 60], default: DEFAULT_SETTINGS.slotStepMin },
    // Anticipación mínima para agendar en línea.
    minNoticeMin: { type: Number, min: 0, max: 7 * 24 * 60, default: DEFAULT_SETTINGS.minNoticeMin },
    // Hasta cuántos días hacia adelante se puede agendar.
    maxDaysAhead: { type: Number, min: 1, max: 365, default: DEFAULT_SETTINGS.maxDaysAhead },
    // La clienta puede cancelar o reprogramar hasta N horas antes.
    minHoursToChange: { type: Number, min: 0, max: 14 * 24, default: DEFAULT_SETTINGS.minHoursToChange },
    // Ofrecer "cualquiera disponible" al agendar.
    allowAnySpecialist: { type: Boolean, default: DEFAULT_SETTINGS.allowAnySpecialist },
    timezone: { type: String, trim: true, default: DEFAULT_SETTINGS.timezone },
    // Aviso al negocio de cada cita; vacío = el correo de contacto de la tienda.
    notifyEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    // Correos a la clienta (agendada, confirmada, reprogramada, cancelada) y
    // avisos al negocio.
    emailCustomer: { type: Boolean, default: DEFAULT_SETTINGS.emailCustomer },
    emailBusiness: { type: Boolean, default: DEFAULT_SETTINGS.emailBusiness },
    // Recordatorio de cita (módulo `reminders`): X horas antes.
    reminderEnabled: { type: Boolean, default: DEFAULT_SETTINGS.reminderEnabled },
    reminderHoursBefore: { type: Number, min: 1, max: 72, default: DEFAULT_SETTINGS.reminderHoursBefore },
    // Último folio de cita (se incrementa de forma atómica al agendar).
    lastAppointmentNumber: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const appointmentServiceSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    name: { type: String, required: true, trim: true },
    durationMin: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const appointmentHistorySchema = new mongoose.Schema(
  {
    // rescheduled | status
    type: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed },
    by: { type: String, enum: ["customer", "staff", "system"], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const appointmentSchema = new mongoose.Schema(
  {
    appointmentNumber: { type: Number, index: true },
    // En el orden en que se hacen.
    services: {
      type: [appointmentServiceSchema],
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: "La cita necesita al menos un servicio." },
    },
    durationMin: { type: Number, required: true, min: 1 },
    bufferMin: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    specialist: { type: mongoose.Schema.Types.ObjectId, ref: "Specialist", required: true },
    specialistName: { type: String, trim: true },
    // Cuenta de la clienta (si agendó con sesión). Nunca se toma del payload.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    // Opcional en las citas que da de alta el negocio (teléfono/mostrador);
    // el sitio siempre lo pide.
    customerEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    customerPhone: { type: String, trim: true, maxlength: 10 },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    // end + bufferMin: lo que ocupa en la agenda.
    blockedUntil: { type: Date, required: true },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: "confirmed" },
    source: { type: String, enum: ["web", "phone", "walk_in"], default: "web" },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    staffNotes: { type: String, trim: true, maxlength: 1000, default: "" },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: ["customer", "staff", null], default: null },
    cancelReason: { type: String, trim: true, maxlength: 300, default: "" },
    history: { type: [appointmentHistorySchema], default: [] },
    // Cuándo se fijó el horario actual (alta o última reprogramación): no se
    // manda recordatorio a una cita fijada dentro de la ventana del recordatorio.
    scheduledAt: { type: Date, default: Date.now },
    // Recordatorio (3.2): enviado una sola vez (lib/scheduler.js#claimEach).
    reminderSentAt: { type: Date, default: null },
    reminderAttempts: { type: Number, default: 0 },
    // La clienta confirmó que asiste (desde el recordatorio).
    attendanceConfirmedAt: { type: Date, default: null },
    // Tarjeta de sellos (lib/loyalty.js): el sello de esta cita ya se sumó.
    loyaltyStampCounted: { type: Boolean, default: false },
    loyaltyCustomer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
appointmentSchema.index({ specialist: 1, start: 1 });
appointmentSchema.index({ status: 1, start: 1, reminderSentAt: 1 });
appointmentSchema.index({ specialist: 1, status: 1, start: 1, blockedUntil: 1 });
appointmentSchema.index({ customer: 1, start: -1 });
appointmentSchema.index({ customerEmail: 1, start: -1 });

const isValidTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Turnos de la semana: cada uno con apertura < cierre y sin encimarse con
// otro del mismo día. Devuelve { shifts } normalizado o { error }.
const normalizeWeeklyHours = (value) => {
  if (!Array.isArray(value)) return { error: "weeklyHours debe ser un arreglo." };
  const shifts = [];
  for (const [i, item] of value.entries()) {
    const day = Number(item?.day);
    const open = asTrimmedString(item?.open);
    const close = asTrimmedString(item?.close);
    if (!Number.isInteger(day) || day < 0 || day > 6) return { error: `weeklyHours[${i}].day debe ser 0 (domingo) a 6 (sábado).` };
    if (!TIME_PATTERN.test(open) || !TIME_PATTERN.test(close)) return { error: `weeklyHours[${i}] necesita inicio y fin en formato HH:MM (24 h).` };
    if (open >= close) return { error: `weeklyHours[${i}]: el fin debe ser después del inicio.` };
    shifts.push({ day, open, close });
  }
  shifts.sort((a, b) => a.day - b.day || a.open.localeCompare(b.open));
  for (let i = 1; i < shifts.length; i += 1) {
    const prev = shifts[i - 1];
    const cur = shifts[i];
    if (prev.day === cur.day && cur.open < prev.close) {
      return { error: "Hay turnos que se enciman el mismo día." };
    }
  }
  for (let day = 0; day <= 6; day += 1) {
    if (shifts.filter((s) => s.day === day).length > MAX_SHIFTS_PER_DAY) {
      return { error: `Máximo ${MAX_SHIFTS_PER_DAY} turnos por día.` };
    }
  }
  return { shifts };
};

const validateSpecialistPayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";
  const out = {};

  if (isCreate || payload.name !== undefined) {
    const name = asTrimmedString(payload.name);
    if (!name || name.length > 100) return sendError(res, 400, "VALIDATION_ERROR", "name es requerido (máx. 100 caracteres).");
    out.name = name;
  }
  if (payload.photoUrl !== undefined) out.photoUrl = asTrimmedString(payload.photoUrl).slice(0, 300);
  if (payload.bio !== undefined) out.bio = asTrimmedString(payload.bio).slice(0, 2000);
  if (payload.color !== undefined) {
    const color = asTrimmedString(payload.color);
    if (!COLOR_PATTERN.test(color)) return sendError(res, 400, "VALIDATION_ERROR", "color debe ser hexadecimal (#RRGGBB).");
    out.color = color.toLowerCase();
  }
  if (payload.user !== undefined) {
    if (payload.user === null || payload.user === "") out.user = null;
    else if (!isValidObjectId(payload.user)) return sendError(res, 400, "VALIDATION_ERROR", "user no válido.");
    else out.user = payload.user;
  }
  if (payload.services !== undefined) {
    if (!Array.isArray(payload.services) || payload.services.some((id) => !isValidObjectId(id))) {
      return sendError(res, 400, "VALIDATION_ERROR", "services debe ser una lista de ids de servicio.");
    }
    out.services = [...new Set(payload.services.map(String))];
  }
  if (payload.weeklyHours !== undefined) {
    const { shifts, error } = normalizeWeeklyHours(payload.weeklyHours);
    if (error) return sendError(res, 400, "VALIDATION_ERROR", error);
    out.weeklyHours = shifts;
  }
  if (payload.sortOrder !== undefined) {
    const sortOrder = asFiniteNumber(payload.sortOrder);
    if (sortOrder === null || sortOrder < 0) return sendError(res, 400, "VALIDATION_ERROR", "sortOrder debe ser un número >= 0.");
    out.sortOrder = Math.floor(sortOrder);
  }
  if (payload.isActive !== undefined) out.isActive = Boolean(payload.isActive);

  req.body = out;
  return next();
};

const validateSettingsPayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const out = {};
  const integerIn = (field, min, max) => {
    if (payload[field] === undefined) return null;
    const num = asFiniteNumber(payload[field]);
    if (num === null || !Number.isInteger(num) || num < min || num > max) return `${field} debe ser un entero de ${min} a ${max}.`;
    out[field] = num;
    return null;
  };
  const numberError =
    integerIn("minNoticeMin", 0, 7 * 24 * 60) ||
    integerIn("maxDaysAhead", 1, 365) ||
    integerIn("minHoursToChange", 0, 14 * 24) ||
    integerIn("slotStepMin", 5, 60) ||
    integerIn("reminderHoursBefore", 1, 72);
  if (numberError) return sendError(res, 400, "VALIDATION_ERROR", numberError);
  if (out.slotStepMin !== undefined && ![5, 10, 15, 20, 30, 60].includes(out.slotStepMin)) {
    return sendError(res, 400, "VALIDATION_ERROR", "slotStepMin debe ser 5, 10, 15, 20, 30 o 60.");
  }
  for (const flag of ["autoConfirm", "allowAnySpecialist", "emailCustomer", "emailBusiness", "reminderEnabled"]) {
    if (payload[flag] !== undefined) out[flag] = Boolean(payload[flag]);
  }
  if (payload.timezone !== undefined) {
    const timezone = asTrimmedString(payload.timezone);
    if (!isValidTimezone(timezone)) return sendError(res, 400, "VALIDATION_ERROR", "timezone no es una zona horaria válida (p. ej. America/Mexico_City).");
    out.timezone = timezone;
  }
  if (payload.notifyEmail !== undefined) {
    const email = asTrimmedString(payload.notifyEmail).toLowerCase();
    if (email && !EMAIL_REGEX.test(email)) return sendError(res, 400, "VALIDATION_ERROR", "notifyEmail no es un correo válido.");
    out.notifyEmail = email;
  }
  req.body = out;
  return next();
};

// Ajustes efectivos (lo guardado sobre los defaults).
const getSettings = async (connection) => {
  const Settings = connection.models.AppointmentSettings;
  const doc = Settings ? await Settings.findOne({ singletonKey: "default" }).lean() : null;
  const out = { ...DEFAULT_SETTINGS };
  if (doc) for (const key of Object.keys(DEFAULT_SETTINGS)) if (doc[key] !== undefined && doc[key] !== null) out[key] = doc[key];
  return out;
};

// Vista pública de una especialista (storefront: elegir con quién).
const toPublicSpecialist = (s) => ({
  _id: s._id,
  name: s.name,
  photoUrl: s.photoUrl || "",
  bio: s.bio || "",
  services: (s.services || []).map(String),
  sortOrder: s.sortOrder || 0,
});

// "id1,id2" o ["id1","id2"] → ids válidos sin repetir (o null si alguno no lo es).
const parseIdList = (value) => {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const ids = raw.map((v) => String(v).trim()).filter(Boolean);
  if (ids.some((id) => !isValidObjectId(id))) return null;
  return [...new Set(ids)];
};

// Tarea de recordatorios por conexión: la arma registerRoutes (que tiene los
// helpers de correo) y la registra registerJobs (server.js llama primero a
// registerRoutes).
const reminderRunners = new WeakMap();

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Specialist = getOrCreateModel(mongooseConnection, "Specialist", specialistSchema);
  const TimeBlock = getOrCreateModel(mongooseConnection, "TimeBlock", timeBlockSchema);
  const Settings = getOrCreateModel(mongooseConnection, "AppointmentSettings", appointmentSettingsSchema);
  const Appointment = getOrCreateModel(mongooseConnection, "Appointment", appointmentSchema);
  const router = express.Router();

  const isManager = (req) => MANAGER_ROLES.includes(req.user?.role);
  const managersOnly = (req, res, next) =>
    isManager(req)
      ? next()
      : sendError(res, 403, "APPOINTMENTS_MANAGER_ONLY", "Solo la administración del negocio puede hacer esto.");

  // La especialista ligada a la cuenta de quien hace la petición (o null).
  const ownSpecialistOf = (req) => Specialist.findOne({ user: req.user.id }).lean();

  // ---- públicas ----
  // ?services=id1,id2 → solo las activas que hacen TODOS esos servicios.
  router.get("/specialists/public", async (req, res) => {
    try {
      const filter = { isActive: true };
      if (req.query.services) {
        const ids = parseIdList(req.query.services);
        if (!ids) return sendError(res, 400, "VALIDATION_ERROR", "services no válido.");
        if (ids.length) filter.services = { $all: ids.map((id) => new mongoose.Types.ObjectId(id)) };
      }
      const specialists = await Specialist.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
      return res.status(200).json({ items: specialists.map(toPublicSpecialist) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar especialistas.");
    }
  });

  // Reglas que el storefront necesita para el calendario de agendar.
  router.get("/settings/public", async (req, res) => {
    try {
      // eslint-disable-next-line no-unused-vars
      const { notifyEmail, autoConfirm, emailCustomer, emailBusiness, reminderEnabled, reminderHoursBefore, ...publicSettings } =
        await getSettings(mongooseConnection);
      return res.status(200).json(publicSettings);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar los ajustes de la agenda.");
    }
  });



  // ================= Avisos por correo (2.5) =================

  const formatWhen = (date, timezone) =>
    new Intl.DateTimeFormat("es-MX", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(date));

  // Página de la cita en el storefront (contrato: FRONTEND_URL/cita/<id>?token=…,
  // que lee GET /public/:id con X-Appointment-Token). null sin FRONTEND_URL.
  const APPOINTMENT_PAGE_PATH = "/cita";
  const customerAppointmentUrl = (appointment) => {
    const base = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
    if (!base) return null;
    const token = signAppointmentAccessToken({ appointmentId: appointment._id, validUntil: appointment.end });
    return `${base}${APPOINTMENT_PAGE_PATH}/${appointment._id}?token=${encodeURIComponent(token)}`;
  };

  const loadBranding = async () => {
    const StoreConfig = mongooseConnection.models.StoreConfig;
    const config = StoreConfig
      ? await StoreConfig.findOne({ singletonKey: "default" }).select("storeName logoUrl theme contactEmail location").lean()
      : null;
    const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
    return {
      branding: {
        storeName: config?.storeName || "Duck-Hack",
        logoUrl: backendPublicUrl && config?.logoUrl ? `${backendPublicUrl}/${String(config.logoUrl).replace(/^\/+/, "")}` : undefined,
        accent: config?.theme?.accentColor,
      },
      address: config?.location?.address || "",
      contactEmail: config?.contactEmail || "",
    };
  };

  // kind (clienta): booked | confirmed | rescheduled | cancelled.
  // business: new | rescheduled | cancelled (solo lo que hace la clienta).
  const sendAppointmentEmails = async (appointment, { customer: customerKind, business: businessKind, previousStart, reason }) => {
    const settings = await getSettings(mongooseConnection);
    const { branding, address, contactEmail } = await loadBranding();
    const when = formatWhen(appointment.start, settings.timezone);

    // El recordatorio tiene su propio interruptor (reminderEnabled), no emailCustomer.
    if (customerKind && (settings.emailCustomer || customerKind === "reminder") && appointment.customerEmail) {
      const kind = customerKind === "booked" && appointment.status === "pending" ? "booked_pending" : customerKind;
      const cancelled = kind === "cancelled";
      const summary = `${appointment.services.map((sv) => sv.name).join(" + ")} — ${branding.storeName}`;
      const manageUrl = customerAppointmentUrl(appointment);
      const description = [
        `Con ${appointment.specialistName}`,
        `Folio #${appointment.appointmentNumber}`,
        manageUrl ? `Ver o cambiar tu cita: ${manageUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const event = { start: appointment.start, end: appointment.end, summary, description, location: address };
      // UID estable por cita; SEQUENCE sube con cada reprogramación y al cancelar.
      const sequence = appointment.history.filter((h) => h.type === "rescheduled").length + (cancelled ? 1 : 0);
      const ics = buildIcs({
        ...event,
        uid: `appointment-${appointment._id}@duck-hack.cloud`,
        sequence,
        url: manageUrl || undefined,
        organizerName: branding.storeName,
        method: cancelled ? "CANCEL" : "PUBLISH",
      });
      const { subject, html, text } = appointmentEmailTemplate({
        kind,
        appointment,
        when,
        address,
        branding,
        manageUrl: cancelled ? null : manageUrl,
        confirmUrl: manageUrl ? `${manageUrl}&accion=confirmar` : null,
        googleUrl: googleCalendarUrl(event),
        reason,
        changeHours: settings.minHoursToChange,
      });
      await notify({
        channel: "email",
        to: appointment.customerEmail,
        subject,
        text,
        html,
        attachments: [{ filename: `cita-${appointment.appointmentNumber}.ics`, content: ics, contentType: `text/calendar; charset=utf-8; method=${cancelled ? "CANCEL" : "PUBLISH"}` }],
      });
    }

    const businessTo = settings.notifyEmail || contactEmail || process.env.CONTACT_EMAIL_TO || process.env.EMAIL_USER;
    if (businessKind && settings.emailBusiness && businessTo) {
      const adminBase = (process.env.ADMIN_URL || "").replace(/\/+$/, "");
      const { subject, html, text } = appointmentBusinessEmailTemplate({
        kind: businessKind,
        appointment,
        when,
        previousWhen: previousStart ? formatWhen(previousStart, settings.timezone) : null,
        branding,
        adminUrl: adminBase ? `${adminBase}/#/admin/appointments` : null,
        reason,
      });
      await notify({ channel: "email", to: businessTo, subject, text, html });
    }
  };

  // ---- Recordatorios (3.2) ----
  // Al cambiar el horario: el recordatorio y la confirmación de asistencia
  // vuelven a empezar.
  const resetReminder = (appointment) => {
    appointment.scheduledAt = new Date();
    appointment.reminderSentAt = null;
    appointment.reminderAttempts = 0;
    appointment.attendanceConfirmedAt = null;
  };

  // Tarea programada: manda los recordatorios que ya tocan (ver registerJobs).
  const runReminders = async ({ now = new Date() } = {}) => {
    if (!(await isModuleContracted(mongooseConnection, "reminders")) || !(await isModuleContracted(mongooseConnection, "appointments"))) {
      return { skipped: "not_contracted" };
    }
    const settings = await getSettings(mongooseConnection);
    if (!settings.reminderEnabled) return { skipped: "disabled" };
    const windowMs = settings.reminderHoursBefore * 60 * MINUTE;
    return claimEach({
      Model: Appointment,
      filter: {
        status: "confirmed",
        customerEmail: { $nin: ["", null] },
        start: { $gt: now, $lte: new Date(+now + windowMs) },
        // Fijada antes de que empezara la ventana (si se agendó o movió dentro
        // de ella, ya recibió su correo de confirmación o de cambio).
        $expr: { $lte: [{ $ifNull: ["$scheduledAt", "$createdAt"] }, { $subtract: ["$start", windowMs] }] },
      },
      markField: "reminderSentAt",
      attemptsField: "reminderAttempts",
      sort: { start: 1 },
      now,
      handle: (appointment) => sendAppointmentEmails(appointment, { customer: "reminder" }),
    });
  };
  reminderRunners.set(mongooseConnection, runReminders);

  // Sin await desde los handlers: un correo fallido no tumba la cita.
  const notifyAppointment = (appointment, kinds) => {
    sendAppointmentEmails(appointment, kinds).catch((error) => {
      console.error(`No fue posible enviar los avisos de la cita ${appointment.appointmentNumber ?? appointment._id}:`, error.message);
    });
  };

  // ================= Motor de citas (2.3) =================

  // Servicios pedidos, en el orden dado: activos, sin repetir, hasta 5; los
  // del sitio además deben agendarse en línea. → { services, durationMin,
  // bufferMin, total } o { error }.
  const resolveServices = async (rawIds, { publicOnly }) => {
    const ids = parseIdList(rawIds);
    if (!ids || !ids.length) return { error: { status: 400, code: "VALIDATION_ERROR", message: "Elige al menos un servicio." } };
    if (ids.length > MAX_SERVICES_PER_APPOINTMENT) {
      return { error: { status: 400, code: "VALIDATION_ERROR", message: `Una cita admite hasta ${MAX_SERVICES_PER_APPOINTMENT} servicios.` } };
    }
    const Service = mongooseConnection.models.Service;
    const found = Service ? await Service.find({ _id: { $in: ids }, isActive: true }).lean() : [];
    const byId = new Map(found.map((sv) => [String(sv._id), sv]));
    const services = ids.map((id) => byId.get(id));
    if (services.some((sv) => !sv || (publicOnly && sv.bookableOnline === false))) {
      return { error: { status: 400, code: "SERVICE_NOT_AVAILABLE", message: "Alguno de los servicios no existe o no se agenda en línea." } };
    }
    return {
      services,
      durationMin: services.reduce((sum, sv) => sum + sv.durationMin, 0),
      bufferMin: Math.max(0, ...services.map((sv) => sv.bufferMin || 0)),
      total: Math.round(services.reduce((sum, sv) => sum + sv.price, 0) * 100) / 100,
    };
  };

  // Especialistas activas que hacen TODOS los servicios (por orden).
  const eligibleSpecialists = (serviceIds) =>
    Specialist.find({ isActive: true, services: { $all: serviceIds } })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

  const loadStoreHours = async () => {
    const StoreConfig = mongooseConnection.models.StoreConfig;
    const config = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).select("businessHours holidays").lean() : null;
    return { businessHours: config?.businessHours || [], holidays: config?.holidays || [] };
  };

  // Lo ocupado de cada especialista en [from, to): citas no canceladas (con su
  // tiempo entre citas) y bloqueos propios y de todo el negocio. → Map id → [{start,end}].
  const loadBusy = async (specialistIds, from, to, { excludeId } = {}) => {
    const appointmentFilter = {
      specialist: { $in: specialistIds },
      status: { $ne: "cancelled" },
      start: { $lt: new Date(to) },
      blockedUntil: { $gt: new Date(from) },
    };
    if (excludeId) appointmentFilter._id = { $ne: excludeId };
    const [appointments, blocks] = await Promise.all([
      Appointment.find(appointmentFilter).select("specialist start blockedUntil").lean(),
      TimeBlock.find({ specialist: { $in: [null, ...specialistIds] }, start: { $lt: new Date(to) }, end: { $gt: new Date(from) } })
        .select("specialist start end")
        .lean(),
    ]);
    const busy = new Map(specialistIds.map((id) => [String(id), []]));
    for (const a of appointments) busy.get(String(a.specialist))?.push({ start: +a.start, end: +a.blockedUntil });
    for (const b of blocks) {
      const interval = { start: +b.start, end: +b.end };
      if (b.specialist) busy.get(String(b.specialist))?.push(interval);
      else for (const list of busy.values()) list.push(interval);
    }
    return busy;
  };

  // Límites de agendado en línea: desde ahora + anticipación, hasta el final
  // del día (local) de hoy + maxDaysAhead. `enforce: false` (staff) sin límites.
  const bookingWindow = (settings, { enforce }) => {
    if (!enforce) return { notBefore: -Infinity, notAfter: Infinity, firstDate: null, lastDate: null };
    const now = Date.now();
    const today = utcToLocal(now, settings.timezone).date;
    const lastDate = addDays(today, settings.maxDaysAhead);
    return {
      notBefore: now + settings.minNoticeMin * MINUTE,
      notAfter: localToUtc(addDays(lastDate, 1), "00:00", settings.timezone) - 1,
      firstDate: today,
      lastDate,
    };
  };

  // Horarios libres de varias especialistas en varios días.
  // → Map dateStr → Map startMs → [specialistId].
  const computeAvailability = async ({ specialists, dates, durationMin, bufferMin, settings, enforce, excludeId }) => {
    const result = new Map(dates.map((d) => [d, new Map()]));
    if (!specialists.length || !dates.length) return result;
    const { businessHours, holidays } = await loadStoreHours();
    const window = bookingWindow(settings, { enforce });
    const from = localToUtc(dates[0], "00:00", settings.timezone);
    const to = localToUtc(addDays(dates[dates.length - 1], 1), "00:00", settings.timezone) + 24 * 60 * MINUTE;
    const busy = await loadBusy(specialists.map((sp) => sp._id), from, to, { excludeId });
    for (const dateStr of dates) {
      if (window.firstDate && (dateStr < window.firstDate || dateStr > window.lastDate)) continue;
      const slotsOfDay = result.get(dateStr);
      for (const sp of specialists) {
        const slots = slotsForDay({
          dateStr,
          timezone: settings.timezone,
          businessHours,
          holidays,
          weeklyHours: sp.weeklyHours,
          durationMin,
          bufferMin,
          stepMin: settings.slotStepMin,
          busy: busy.get(String(sp._id)) || [],
          notBefore: window.notBefore,
          notAfter: window.notAfter,
        });
        for (const t of slots) {
          if (!slotsOfDay.has(t)) slotsOfDay.set(t, []);
          slotsOfDay.get(t).push(String(sp._id));
        }
      }
    }
    return result;
  };

  // Candado por especialista (sin transacciones): se toma con un update
  // condicionado y vence solo a los LOCK_MS por si el proceso se cae.
  const withSpecialistLock = async (specialistId, fn) => {
    const token = crypto.randomBytes(12).toString("hex");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const now = new Date();
      const taken = await Specialist.findOneAndUpdate(
        { _id: specialistId, $or: [{ "bookingLock.until": null }, { "bookingLock.until": { $lt: now } }] },
        { $set: { bookingLock: { token, until: new Date(now.getTime() + LOCK_MS) } } },
        { new: true }
      ).lean();
      if (taken) {
        try {
          return await fn();
        } finally {
          await Specialist.updateOne({ _id: specialistId, "bookingLock.token": token }, { $set: { bookingLock: { token: null, until: null } } });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.floor(Math.random() * 50)));
    }
    const error = new Error("No fue posible apartar el horario, intenta de nuevo.");
    error.code = "LOCK_TIMEOUT";
    throw error;
  };

  // Aparta `startMs` con la primera candidata libre (dentro de su candado se
  // vuelve a calcular la disponibilidad) y llama `save(specialist)`.
  // → lo que devuelva save, o null si nadie tenía ese horario libre.
  const bookSlot = async ({ candidates, startMs, durationMin, bufferMin, settings, enforce, excludeId, save }) => {
    const dateStr = utcToLocal(startMs, settings.timezone).date;
    for (const sp of candidates) {
      const outcome = await withSpecialistLock(sp._id, async () => {
        const availability = await computeAvailability({ specialists: [sp], dates: [dateStr], durationMin, bufferMin, settings, enforce, excludeId });
        if (!availability.get(dateStr).has(startMs)) return null;
        return save(sp);
      });
      if (outcome) return outcome;
    }
    return null;
  };

  // Para "cualquiera disponible": primero la que tiene menos citas ese día.
  const orderByLoad = async (specialists, dateStr, timezone) => {
    const from = localToUtc(dateStr, "00:00", timezone);
    const to = localToUtc(addDays(dateStr, 1), "00:00", timezone);
    const counts = await Appointment.aggregate([
      { $match: { specialist: { $in: specialists.map((sp) => sp._id) }, status: { $ne: "cancelled" }, start: { $gte: new Date(from), $lt: new Date(to) } } },
      { $group: { _id: "$specialist", count: { $sum: 1 } } },
    ]);
    const countOf = new Map(counts.map((c) => [String(c._id), c.count]));
    return [...specialists].sort((a, b) => (countOf.get(String(a._id)) || 0) - (countOf.get(String(b._id)) || 0));
  };

  const nextAppointmentNumber = async () => {
    const doc = await Settings.findOneAndUpdate(
      { singletonKey: "default" },
      { $inc: { lastAppointmentNumber: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return doc.lastAppointmentNumber;
  };

  // ¿Todavía puede la clienta cancelar o reprogramar?
  const changeDeadlineOf = (appointment, settings) => new Date(+appointment.start - settings.minHoursToChange * 60 * MINUTE);
  const canCustomerChange = (appointment, settings) =>
    CHANGEABLE_STATUSES.includes(appointment.status) && Date.now() <= +changeDeadlineOf(appointment, settings);

  // Lo que ve la clienta de su cita (sin notas internas).
  const customerView = (a, settings) => ({
    _id: a._id,
    appointmentNumber: a.appointmentNumber,
    status: a.status,
    start: a.start,
    end: a.end,
    durationMin: a.durationMin,
    services: a.services.map(({ service, name, durationMin, price }) => ({ service, name, durationMin, price })),
    total: a.total,
    specialist: { _id: a.specialist?._id || a.specialist, name: a.specialistName },
    customerName: a.customerName,
    customerEmail: a.customerEmail,
    customerPhone: a.customerPhone,
    notes: a.notes,
    timezone: settings.timezone,
    canChange: canCustomerChange(a, settings),
    changeDeadline: changeDeadlineOf(a, settings),
    cancelledAt: a.cancelledAt,
    attendanceConfirmedAt: a.attendanceConfirmedAt || null,
  });

  // Bearer opcional de clienta (como el checkout de pedidos): si es válido y
  // es customer, la cita queda en su cuenta; si no, sigue como invitada.
  const optionalCustomer = (req) => {
    const token = extractBearerToken(req.header("Authorization"));
    if (!token) return null;
    try {
      const decoded = verifyAccessToken(token);
      return decoded.role === ROLES.CUSTOMER ? decoded.id : null;
    } catch {
      return null;
    }
  };

  const publicRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 20,
    code: "RATE_LIMIT_APPOINTMENTS_EXCEEDED",
    message: "Demasiados intentos. Intenta de nuevo en unos minutos.",
    sendError,
  });
  const availabilityRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 300,
    code: "RATE_LIMIT_AVAILABILITY_EXCEEDED",
    message: "Demasiadas consultas. Intenta de nuevo en unos minutos.",
    sendError,
  });

  // GET /availability?services=a,b&specialist=<id>|any
  //   &date=YYYY-MM-DD → { slots: [{ start, time, specialists }] }
  //   &from=&to=        → { days: [{ date, available, slots }] } (calendario)
  router.get("/availability", availabilityRateLimiter, async (req, res) => {
    try {
      const settings = await getSettings(mongooseConnection);
      const resolved = await resolveServices(req.query.services, { publicOnly: true });
      if (resolved.error) return sendError(res, resolved.error.status, resolved.error.code, resolved.error.message);
      const serviceIds = resolved.services.map((sv) => sv._id);

      let specialists = await eligibleSpecialists(serviceIds);
      const wanted = req.query.specialist && req.query.specialist !== "any" ? String(req.query.specialist) : null;
      if (wanted) {
        specialists = specialists.filter((sp) => String(sp._id) === wanted);
        if (!specialists.length) {
          return sendError(res, 400, "SPECIALIST_NOT_AVAILABLE", "Esa especialista no hace todos los servicios elegidos.");
        }
      } else if (!settings.allowAnySpecialist) {
        return sendError(res, 400, "SPECIALIST_REQUIRED", "Elige con quién quieres tu cita.");
      }

      let dates;
      if (req.query.date) {
        if (!isValidDate(req.query.date)) return sendError(res, 400, "VALIDATION_ERROR", "date debe ser AAAA-MM-DD.");
        dates = [req.query.date];
      } else {
        const { from, to } = req.query;
        if (!isValidDate(from) || !isValidDate(to) || to < from) {
          return sendError(res, 400, "VALIDATION_ERROR", "Manda date, o from y to (AAAA-MM-DD).");
        }
        dates = [];
        for (let d = from; d <= to && dates.length < MAX_RANGE_DAYS; d = addDays(d, 1)) dates.push(d);
      }

      const availability = await computeAvailability({
        specialists,
        dates,
        durationMin: resolved.durationMin,
        bufferMin: resolved.bufferMin,
        settings,
        enforce: true,
      });
      const base = { timezone: settings.timezone, durationMin: resolved.durationMin, total: resolved.total };
      if (req.query.date) {
        const slots = [...availability.get(dates[0]).entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([t, ids]) => ({ start: new Date(t), time: utcToLocal(t, settings.timezone).time, specialists: ids }));
        return res.status(200).json({ ...base, date: dates[0], slots });
      }
      return res.status(200).json({
        ...base,
        days: dates.map((date) => ({ date, available: availability.get(date).size > 0, slots: availability.get(date).size })),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la disponibilidad.");
    }
  });

  // Datos de contacto de la clienta (alta en el sitio).
  const validateContact = (payload) => {
    const customerName = asTrimmedString(payload.customerName);
    const customerEmail = asTrimmedString(payload.customerEmail).toLowerCase();
    const customerPhone = normalizeMxPhone(payload.customerPhone);
    if (!customerName || customerName.length > 120) return { error: "Escribe tu nombre." };
    if (!EMAIL_REGEX.test(customerEmail) || customerEmail.length > 160) return { error: "Escribe un correo válido." };
    if (!PHONE_DIGITS.test(customerPhone)) return { error: "Escribe un teléfono de 10 dígitos." };
    const notes = asTrimmedString(payload.notes);
    if (notes.length > 500) return { error: "Las notas pueden tener hasta 500 caracteres." };
    return { customerName, customerEmail, customerPhone, notes };
  };

  // POST /public — agendar desde el sitio.
  // { services: [ids], specialist: id | "any", start: ISO, customerName,
  //   customerEmail, customerPhone, notes } + Bearer opcional de clienta.
  router.post("/public", publicRateLimiter, async (req, res) => {
    try {
      const payload = req.body || {};
      const settings = await getSettings(mongooseConnection);
      const contact = validateContact(payload);
      if (contact.error) return sendError(res, 400, "VALIDATION_ERROR", contact.error);
      const startMs = Date.parse(payload.start);
      if (Number.isNaN(startMs)) return sendError(res, 400, "VALIDATION_ERROR", "start debe ser una fecha y hora válida.");

      const resolved = await resolveServices(payload.services, { publicOnly: true });
      if (resolved.error) return sendError(res, resolved.error.status, resolved.error.code, resolved.error.message);
      let candidates = await eligibleSpecialists(resolved.services.map((sv) => sv._id));
      const wanted = payload.specialist && payload.specialist !== "any" ? String(payload.specialist) : null;
      if (wanted) {
        candidates = candidates.filter((sp) => String(sp._id) === wanted);
        if (!candidates.length) return sendError(res, 400, "SPECIALIST_NOT_AVAILABLE", "Esa especialista no hace todos los servicios elegidos.");
      } else {
        if (!settings.allowAnySpecialist) return sendError(res, 400, "SPECIALIST_REQUIRED", "Elige con quién quieres tu cita.");
        candidates = await orderByLoad(candidates, utcToLocal(startMs, settings.timezone).date, settings.timezone);
      }

      const customer = optionalCustomer(req);
      const appointment = await bookSlot({
        candidates,
        startMs,
        durationMin: resolved.durationMin,
        bufferMin: resolved.bufferMin,
        settings,
        enforce: true,
        save: async (sp) =>
          Appointment.create({
            appointmentNumber: await nextAppointmentNumber(),
            services: resolved.services.map((sv) => ({ service: sv._id, name: sv.name, durationMin: sv.durationMin, price: sv.price })),
            durationMin: resolved.durationMin,
            bufferMin: resolved.bufferMin,
            total: resolved.total,
            specialist: sp._id,
            specialistName: sp.name,
            customer,
            ...contact,
            start: new Date(startMs),
            end: new Date(startMs + resolved.durationMin * MINUTE),
            blockedUntil: new Date(startMs + (resolved.durationMin + resolved.bufferMin) * MINUTE),
            status: settings.autoConfirm ? "confirmed" : "pending",
            source: "web",
          }),
      });
      if (!appointment) {
        return sendError(res, 409, "SLOT_TAKEN", "Ese horario ya no está disponible. Elige otro, por favor.");
      }
      notifyAppointment(appointment, { customer: "booked", business: "new" });
      return res.status(201).json({
        message: appointment.status === "confirmed" ? "¡Tu cita está agendada!" : "Recibimos tu cita; te avisaremos cuando la confirmemos.",
        appointment: customerView(appointment, settings),
        appointmentAccessToken: signAppointmentAccessToken({ appointmentId: appointment._id, validUntil: appointment.end }),
      });
    } catch (error) {
      if (error?.code === "LOCK_TIMEOUT") return sendError(res, 503, "TRY_AGAIN", error.message);
      return handleMongooseError(sendError, res, error, "Error al agendar la cita.");
    }
  });

  // Quién puede ver/cambiar una cita desde el sitio: la invitada con su token
  // (X-Appointment-Token) o la dueña con sesión (cuenta ligada o mismo
  // correo, igual que GET /api/orders/mine). Deja req.appointment.
  const resolveCustomerAccess = async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) return sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");
      const appointment = await Appointment.findById(req.params.id);
      if (!appointment) return sendError(res, 404, "APPOINTMENT_NOT_FOUND", "Cita no encontrada.");
      const accessToken = req.header("X-Appointment-Token");
      if (accessToken) {
        try {
          const decoded = verifyAppointmentAccessToken(accessToken);
          if (decoded.aid !== String(appointment._id)) throw new Error("otra cita");
        } catch {
          return sendError(res, 401, "APPOINTMENT_TOKEN_INVALID", "El enlace de la cita no es válido o ya venció.");
        }
        req.appointment = appointment;
        return next();
      }
      const bearer = extractBearerToken(req.header("Authorization"));
      if (!bearer) return sendError(res, 401, "TOKEN_REQUIRED", "Inicia sesión o usa el enlace de tu cita.");
      let decoded;
      try {
        decoded = verifyAccessToken(bearer);
      } catch {
        return sendError(res, 401, "TOKEN_INVALID_OR_EXPIRED", "Token no válido o expirado.");
      }
      const User = mongooseConnection.models.User;
      const me = User ? await User.findById(decoded.id).select("email").lean() : null;
      const isOwner =
        (appointment.customer && String(appointment.customer) === String(decoded.id)) ||
        (me?.email && me.email === appointment.customerEmail);
      if (!isOwner) return sendError(res, 404, "APPOINTMENT_NOT_FOUND", "Cita no encontrada.");
      req.appointment = appointment;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la cita.");
    }
  };

  router.get("/public/:id", resolveCustomerAccess, async (req, res) => {
    const settings = await getSettings(mongooseConnection);
    return res.status(200).json({ appointment: customerView(req.appointment, settings) });
  });

  // Cancelar desde el sitio: { reason? }. Respeta minHoursToChange.
  router.post("/public/:id/cancel", publicRateLimiter, resolveCustomerAccess, async (req, res) => {
    try {
      const settings = await getSettings(mongooseConnection);
      const { appointment } = req;
      if (!CHANGEABLE_STATUSES.includes(appointment.status)) {
        return sendError(res, 409, "APPOINTMENT_NOT_CHANGEABLE", "Esta cita ya no se puede cancelar.");
      }
      if (!canCustomerChange(appointment, settings)) {
        return sendError(
          res,
          409,
          "CHANGE_WINDOW_CLOSED",
          `Las citas se pueden cancelar hasta ${settings.minHoursToChange} horas antes. Comunícate con nosotros.`
        );
      }
      const from = appointment.status;
      appointment.status = "cancelled";
      appointment.cancelledAt = new Date();
      appointment.cancelledBy = "customer";
      appointment.cancelReason = asTrimmedString(req.body?.reason).slice(0, 300);
      appointment.history.push({ type: "status", from, to: "cancelled", by: "customer" });
      await appointment.save();
      notifyAppointment(appointment, { customer: "cancelled", business: "cancelled", reason: appointment.cancelReason });
      return res.status(200).json({ message: "Tu cita se canceló.", appointment: customerView(appointment, settings) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al cancelar la cita.");
    }
  });

  // Confirmar asistencia (desde el recordatorio). Idempotente; solo citas
  // por venir que sigan pendientes o confirmadas.
  router.post("/public/:id/confirm-attendance", publicRateLimiter, resolveCustomerAccess, async (req, res) => {
    try {
      const settings = await getSettings(mongooseConnection);
      const { appointment } = req;
      if (!CHANGEABLE_STATUSES.includes(appointment.status) || +appointment.start <= Date.now()) {
        return sendError(res, 409, "APPOINTMENT_NOT_CHANGEABLE", "Esta cita ya no se puede confirmar.");
      }
      if (!appointment.attendanceConfirmedAt) {
        appointment.attendanceConfirmedAt = new Date();
        appointment.history.push({ type: "attendance", from: null, to: "confirmed", by: "customer" });
        await appointment.save();
      }
      return res.status(200).json({ message: "¡Gracias! Confirmaste tu asistencia.", appointment: customerView(appointment, settings) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al confirmar la asistencia.");
    }
  });

  // Reprogramar desde el sitio: { start, specialist?: id | "any" }. Mismos
  // servicios; sin especialista, se queda con la misma. Respeta
  // minHoursToChange (sobre la cita actual) y las reglas de agendado (sobre la nueva).
  router.post("/public/:id/reschedule", publicRateLimiter, resolveCustomerAccess, async (req, res) => {
    try {
      const settings = await getSettings(mongooseConnection);
      const { appointment } = req;
      if (!CHANGEABLE_STATUSES.includes(appointment.status)) {
        return sendError(res, 409, "APPOINTMENT_NOT_CHANGEABLE", "Esta cita ya no se puede reprogramar.");
      }
      if (!canCustomerChange(appointment, settings)) {
        return sendError(
          res,
          409,
          "CHANGE_WINDOW_CLOSED",
          `Las citas se pueden reprogramar hasta ${settings.minHoursToChange} horas antes. Comunícate con nosotros.`
        );
      }
      const startMs = Date.parse(req.body?.start);
      if (Number.isNaN(startMs)) return sendError(res, 400, "VALIDATION_ERROR", "start debe ser una fecha y hora válida.");

      const serviceIds = appointment.services.map((sv) => sv.service);
      let candidates = await eligibleSpecialists(serviceIds);
      const wanted = req.body?.specialist ? String(req.body.specialist) : String(appointment.specialist);
      if (wanted !== "any") {
        candidates = candidates.filter((sp) => String(sp._id) === wanted);
        if (!candidates.length) return sendError(res, 400, "SPECIALIST_NOT_AVAILABLE", "Esa especialista ya no hace todos los servicios de tu cita.");
      } else {
        candidates = await orderByLoad(candidates, utcToLocal(startMs, settings.timezone).date, settings.timezone);
      }

      const before = { start: appointment.start, specialist: appointment.specialistName };
      const updated = await bookSlot({
        candidates,
        startMs,
        durationMin: appointment.durationMin,
        bufferMin: appointment.bufferMin,
        settings,
        enforce: true,
        excludeId: appointment._id,
        save: async (sp) => {
          appointment.specialist = sp._id;
          appointment.specialistName = sp.name;
          appointment.start = new Date(startMs);
          appointment.end = new Date(startMs + appointment.durationMin * MINUTE);
          appointment.blockedUntil = new Date(startMs + (appointment.durationMin + appointment.bufferMin) * MINUTE);
          appointment.history.push({ type: "rescheduled", from: before, to: { start: appointment.start, specialist: sp.name }, by: "customer" });
          resetReminder(appointment);
          return appointment.save();
        },
      });
      if (!updated) return sendError(res, 409, "SLOT_TAKEN", "Ese horario ya no está disponible. Elige otro, por favor.");
      notifyAppointment(updated, { customer: "rescheduled", business: "rescheduled", previousStart: before.start });
      return res.status(200).json({
        message: "Tu cita se reprogramó.",
        appointment: customerView(updated, settings),
        appointmentAccessToken: signAppointmentAccessToken({ appointmentId: updated._id, validUntil: updated.end }),
      });
    } catch (error) {
      if (error?.code === "LOCK_TIMEOUT") return sendError(res, 503, "TRY_AGAIN", error.message);
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al reprogramar la cita.");
    }
  });

  // Mis citas (con sesión): por cuenta ligada o mismo correo. ?scope=upcoming|past
  router.get("/mine", verifyToken, async (req, res) => {
    try {
      const settings = await getSettings(mongooseConnection);
      const User = mongooseConnection.models.User;
      const me = User ? await User.findById(req.user.id).select("email").lean() : null;
      const filter = me?.email ? { $or: [{ customer: req.user.id }, { customerEmail: me.email }] } : { customer: req.user.id };
      const now = new Date();
      if (req.query.scope === "upcoming") filter.end = { $gte: now };
      if (req.query.scope === "past") filter.end = { $lt: now };
      const appointments = await Appointment.find(filter)
        .sort({ start: req.query.scope === "past" ? -1 : 1 })
        .limit(200);
      return res.status(200).json({ items: appointments.map((a) => customerView(a, settings)) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar tus citas.");
    }
  });

  // ---- staff ----
  const staff = express.Router();
  staff.use(verifyToken);
  staff.use(createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("appointments"));

  // -- Ajustes --
  staff.get("/settings", async (req, res) => {
    try {
      return res.status(200).json(await getSettings(mongooseConnection));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar los ajustes de la agenda.");
    }
  });

  staff.put("/settings", managersOnly, validateSettingsPayload(sendError), async (req, res) => {
    try {
      await Settings.updateOne({ singletonKey: "default" }, { $set: req.body }, { upsert: true, runValidators: true });
      return res.status(200).json({ message: "Ajustes de la agenda guardados.", settings: await getSettings(mongooseConnection) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al guardar los ajustes de la agenda.");
    }
  });

  // -- Especialistas --
  // Cuentas de staff que se pueden ligar (sin necesitar el módulo Usuarios).
  staff.get("/specialists/linkable-users", managersOnly, async (req, res) => {
    try {
      const User = mongooseConnection.models.User;
      const users = User ? await User.find({ role: { $in: LINKABLE_ROLES } }).select("name email role").sort({ name: 1 }).lean() : [];
      const linked = await Specialist.find({ user: { $ne: null } }).select("user name").lean();
      const linkedBy = new Map(linked.map((s) => [String(s.user), s]));
      return res.status(200).json({
        items: users.map((u) => ({
          _id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          linkedTo: linkedBy.get(String(u._id)) ? { _id: linkedBy.get(String(u._id))._id, name: linkedBy.get(String(u._id)).name } : null,
        })),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar las cuentas.");
    }
  });

  // Encargadas: todas. Collaborator: solo la suya (o ninguna).
  staff.get("/specialists", async (req, res) => {
    try {
      const filter = {};
      if (!isManager(req)) filter.user = req.user.id;
      if (req.query.isActive === "true") filter.isActive = true;
      const specialists = await Specialist.find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .populate("user", "name email role")
        .populate("services", "name durationMin isActive")
        .lean();
      return res.status(200).json({ items: specialists.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar especialistas.");
    }
  });

  // Revisa que la cuenta exista y sea de staff, y que los servicios existan.
  const checkReferences = async (body) => {
    if (body.user) {
      const User = mongooseConnection.models.User;
      const user = User ? await User.findById(body.user).select("role").lean() : null;
      if (!user || !LINKABLE_ROLES.includes(user.role)) {
        return { status: 400, code: "USER_NOT_LINKABLE", message: "La cuenta elegida no existe o no es de staff (colaboradora o administradora)." };
      }
    }
    if (body.services?.length) {
      const Service = mongooseConnection.models.Service;
      const found = Service ? await Service.countDocuments({ _id: { $in: body.services } }) : 0;
      if (found !== body.services.length) return { status: 400, code: "SERVICE_NOT_FOUND", message: "Alguno de los servicios no existe." };
    }
    return null;
  };

  const linkTakenError = (res) =>
    sendError(res, 409, "USER_ALREADY_LINKED", "Esa cuenta ya está ligada a otra especialista.");

  staff.post("/specialists", managersOnly, validateSpecialistPayload(sendError), async (req, res) => {
    try {
      const refError = await checkReferences(req.body);
      if (refError) return sendError(res, refError.status, refError.code, refError.message);
      const specialist = await Specialist.create(req.body);
      return res.status(201).json({ message: "Especialista creada.", specialist: sanitizeDoc(specialist) });
    } catch (error) {
      if (error?.code === 11000) return linkTakenError(res);
      return handleMongooseError(sendError, res, error, "Error al crear la especialista.");
    }
  });

  const ensureSpecialist = async (req, res, next) => {
    if (!isValidObjectId(req.params.id)) return sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");
    const specialist = await Specialist.findById(req.params.id).catch(() => null);
    if (!specialist) return sendError(res, 404, "SPECIALIST_NOT_FOUND", "Especialista no encontrada.");
    if (!isManager(req) && String(specialist.user) !== String(req.user.id)) {
      return sendError(res, 404, "SPECIALIST_NOT_FOUND", "Especialista no encontrada.");
    }
    req.specialist = specialist;
    return next();
  };

  staff.get("/specialists/:id", ensureSpecialist, async (req, res) => {
    await req.specialist.populate([
      { path: "user", select: "name email role" },
      { path: "services", select: "name durationMin isActive" },
    ]);
    return res.status(200).json(sanitizeDoc(req.specialist));
  });

  staff.put("/specialists/:id", managersOnly, ensureSpecialist, validateSpecialistPayload(sendError), async (req, res) => {
    try {
      const refError = await checkReferences(req.body);
      if (refError) return sendError(res, refError.status, refError.code, refError.message);
      Object.assign(req.specialist, req.body);
      await req.specialist.save();
      return res.status(200).json({ message: "Especialista actualizada.", specialist: sanitizeDoc(req.specialist) });
    } catch (error) {
      if (error?.code === 11000) return linkTakenError(res);
      return handleMongooseError(sendError, res, error, "Error al actualizar la especialista.");
    }
  });

  // Con citas no se borra (las citas guardan quién las atendió): se desactiva.
  staff.delete("/specialists/:id", managersOnly, ensureSpecialist, async (req, res) => {
    try {
      const Appointment = mongooseConnection.models.Appointment;
      if (Appointment && (await Appointment.exists({ specialist: req.specialist._id }))) {
        return sendError(res, 409, "SPECIALIST_HAS_APPOINTMENTS", "Esta especialista ya tiene citas: desactívala en lugar de borrarla.");
      }
      await TimeBlock.deleteMany({ specialist: req.specialist._id });
      await req.specialist.deleteOne();
      return res.status(200).json({ message: "Especialista eliminada." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar la especialista.");
    }
  });

  // -- Bloqueos de horario --
  // GET ?from=&to=&specialist= (los que se cruzan con el rango). Collaborator:
  // los suyos y los de todo el negocio.
  staff.get("/blocks", async (req, res) => {
    try {
      const filter = {};
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;
      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
        return sendError(res, 400, "VALIDATION_ERROR", "from / to no son fechas válidas.");
      }
      if (to) filter.start = { $lt: to };
      if (from) filter.end = { $gt: from };
      if (!isManager(req)) {
        const own = await ownSpecialistOf(req);
        filter.specialist = { $in: [null, ...(own ? [own._id] : [])] };
      } else if (req.query.specialist) {
        if (!isValidObjectId(req.query.specialist)) return sendError(res, 400, "VALIDATION_ERROR", "specialist no válido.");
        filter.specialist = { $in: [null, req.query.specialist] };
      }
      const blocks = await TimeBlock.find(filter).sort({ start: 1 }).limit(1000).populate("specialist", "name color").lean();
      return res.status(200).json({ items: blocks.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar los bloqueos.");
    }
  });

  // { specialist | null, start, end, reason }. Collaborator: solo el suyo.
  staff.post("/blocks", async (req, res) => {
    try {
      const payload = req.body || {};
      const start = new Date(payload.start);
      const end = new Date(payload.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return sendError(res, 400, "VALIDATION_ERROR", "start y end deben ser fechas válidas.");
      }
      if (end <= start) return sendError(res, 400, "VALIDATION_ERROR", "El fin del bloqueo debe ser después del inicio.");
      if (end - start > 366 * 24 * 60 * 60 * 1000) return sendError(res, 400, "VALIDATION_ERROR", "Un bloqueo puede durar hasta un año.");

      let specialist = payload.specialist || null;
      if (!isManager(req)) {
        const own = await ownSpecialistOf(req);
        if (!own) return sendError(res, 403, "NOT_A_SPECIALIST", "Tu cuenta no está ligada a una especialista.");
        if (specialist && String(specialist) !== String(own._id)) {
          return sendError(res, 403, "APPOINTMENTS_MANAGER_ONLY", "Solo puedes bloquear tu propio horario.");
        }
        specialist = own._id;
      } else if (specialist) {
        if (!isValidObjectId(specialist) || !(await Specialist.exists({ _id: specialist }))) {
          return sendError(res, 400, "SPECIALIST_NOT_FOUND", "La especialista no existe.");
        }
      }
      const block = await TimeBlock.create({
        specialist,
        start,
        end,
        reason: asTrimmedString(payload.reason).slice(0, 120),
        createdBy: req.user.id,
      });
      return res.status(201).json({ message: "Horario bloqueado.", block: sanitizeDoc(block) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al bloquear el horario.");
    }
  });

  staff.delete("/blocks/:id", async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) return sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");
      const block = await TimeBlock.findById(req.params.id);
      if (!block) return sendError(res, 404, "BLOCK_NOT_FOUND", "Bloqueo no encontrado.");
      if (!isManager(req)) {
        const own = await ownSpecialistOf(req);
        if (!own || String(block.specialist) !== String(own._id)) {
          return sendError(res, 403, "APPOINTMENTS_MANAGER_ONLY", "Solo puedes quitar bloqueos de tu propio horario.");
        }
      }
      await block.deleteOne();
      return res.status(200).json({ message: "Bloqueo eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el bloqueo.");
    }
  });


  // ================= Agenda del panel (2.4) =================

  // Vista de staff (todo, con el color de la especialista).
  const staffView = (a) => {
    const doc = sanitizeDoc(a);
    if (a.specialist && a.specialist.color) {
      doc.specialist = { _id: a.specialist._id, name: a.specialist.name, color: a.specialist.color };
    }
    return doc;
  };

  // ¿Qué impide poner esta cita aquí? (staff) → null | "overlap" | "outside".
  // overlap = choca con otra cita no cancelada (contando los tiempos entre
  // citas); outside = fuera del horario negocio ∩ especialista, en festivo o
  // sobre un bloqueo.
  const staffSlotProblem = async ({ specialist, startMs, durationMin, bufferMin, settings, excludeId, force }) => {
    const occupied = { start: startMs, end: startMs + (durationMin + bufferMin) * MINUTE };
    const filter = {
      specialist: specialist._id,
      status: { $ne: "cancelled" },
      start: { $lt: new Date(occupied.end) },
      blockedUntil: { $gt: new Date(occupied.start) },
    };
    if (excludeId) filter._id = { $ne: excludeId };
    if (await Appointment.exists(filter)) return "overlap";
    if (force) return null;
    const dateStr = utcToLocal(startMs, settings.timezone).date;
    const { businessHours, holidays } = await loadStoreHours();
    const windows = workingWindows({ dateStr, timezone: settings.timezone, businessHours, holidays, weeklyHours: specialist.weeklyHours });
    const service = { start: startMs, end: startMs + durationMin * MINUTE };
    if (!windows.some((w) => service.start >= w.start && service.end <= w.end)) return "outside";
    const blocked = await TimeBlock.exists({
      specialist: { $in: [null, specialist._id] },
      start: { $lt: new Date(occupied.end) },
      end: { $gt: new Date(occupied.start) },
    });
    return blocked ? "outside" : null;
  };

  const sendSlotProblem = (res, problem) =>
    problem === "overlap"
      ? sendError(res, 409, "SLOT_TAKEN", "Ese horario se empalma con otra cita de la especialista.")
      : sendError(res, 409, "OUTSIDE_HOURS", "Ese horario está fuera del horario de la especialista o bloqueado. ¿Agendar de todos modos?");

  // Collaborator: solo su especialista. → { specialistId } | { none: true } (sin ligar) | {} (encargada).
  const scopeOf = async (req) => {
    if (isManager(req)) return {};
    const own = await ownSpecialistOf(req);
    return own ? { specialistId: String(own._id) } : { none: true };
  };

  const loadStaffSpecialist = async (req, id) => {
    if (!isValidObjectId(id)) return { error: [400, "VALIDATION_ERROR", "specialist no válido."] };
    const scope = await scopeOf(req);
    if (scope.none || (scope.specialistId && scope.specialistId !== String(id))) {
      return { error: [403, "APPOINTMENTS_MANAGER_ONLY", "Solo puedes manejar tu propia agenda."] };
    }
    const sp = await Specialist.findById(id).lean();
    if (!sp) return { error: [400, "SPECIALIST_NOT_FOUND", "La especialista no existe."] };
    return { specialist: sp };
  };

  // GET /?from=&to=&specialist=&status= (rango obligatorio, hasta 62 días).
  staff.get("/", async (req, res) => {
    try {
      const from = new Date(req.query.from);
      const to = new Date(req.query.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
        return sendError(res, 400, "VALIDATION_ERROR", "Manda from y to (fechas ISO).");
      }
      if (to - from > MAX_RANGE_DAYS * 24 * 60 * MINUTE) return sendError(res, 400, "VALIDATION_ERROR", `El rango puede ser de hasta ${MAX_RANGE_DAYS} días.`);
      const filter = { start: { $lt: to }, end: { $gt: from } };
      const scope = await scopeOf(req);
      if (scope.none) return res.status(200).json({ items: [] });
      if (scope.specialistId) filter.specialist = scope.specialistId;
      else if (req.query.specialist) {
        if (!isValidObjectId(req.query.specialist)) return sendError(res, 400, "VALIDATION_ERROR", "specialist no válido.");
        filter.specialist = req.query.specialist;
      }
      if (req.query.status) {
        const statuses = String(req.query.status).split(",").filter((st) => APPOINTMENT_STATUSES.includes(st));
        if (statuses.length) filter.status = { $in: statuses };
      }
      const appointments = await Appointment.find(filter).sort({ start: 1 }).limit(2000).populate("specialist", "name color").lean();
      return res.status(200).json({ items: appointments.map(staffView) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar las citas.");
    }
  });

  // Datos de contacto en el panel: nombre obligatorio; correo y teléfono opcionales.
  const validateStaffContact = (payload, { partial }) => {
    const out = {};
    if (!partial || payload.customerName !== undefined) {
      const name = asTrimmedString(payload.customerName);
      if (!name || name.length > 120) return { error: "Escribe el nombre de la clienta." };
      out.customerName = name;
    }
    if (payload.customerEmail !== undefined) {
      const email = asTrimmedString(payload.customerEmail).toLowerCase();
      if (email && (!EMAIL_REGEX.test(email) || email.length > 160)) return { error: "El correo no es válido." };
      out.customerEmail = email;
    }
    if (payload.customerPhone !== undefined) {
      const phone = normalizeMxPhone(payload.customerPhone);
      if (phone && !PHONE_DIGITS.test(phone)) return { error: "El teléfono debe tener 10 dígitos." };
      out.customerPhone = phone;
    }
    for (const [field, max] of [["notes", 500], ["staffNotes", 1000]]) {
      if (payload[field] !== undefined) {
        const value = asTrimmedString(payload[field]);
        if (value.length > max) return { error: `${field} admite hasta ${max} caracteres.` };
        out[field] = value;
      }
    }
    return { contact: out };
  };

  // POST / — alta manual: { services, specialist, start, customerName,
  // customerEmail?, customerPhone?, notes?, staffNotes?, source: phone|walk_in,
  // status?: confirmed|pending, force? }.
  staff.post("/", async (req, res) => {
    try {
      const payload = req.body || {};
      const settings = await getSettings(mongooseConnection);
      const { contact, error: contactError } = validateStaffContact(payload, { partial: false });
      if (contactError) return sendError(res, 400, "VALIDATION_ERROR", contactError);
      const startMs = Date.parse(payload.start);
      if (Number.isNaN(startMs)) return sendError(res, 400, "VALIDATION_ERROR", "start debe ser una fecha y hora válida.");
      const source = ["phone", "walk_in"].includes(payload.source) ? payload.source : "phone";
      const status = payload.status === "pending" ? "pending" : "confirmed";

      const resolved = await resolveServices(payload.services, { publicOnly: false });
      if (resolved.error) return sendError(res, resolved.error.status, resolved.error.code, resolved.error.message);
      const { specialist, error } = await loadStaffSpecialist(req, payload.specialist);
      if (error) return sendError(res, ...error);
      const missing = resolved.services.filter((sv) => !specialist.services.some((id) => String(id) === String(sv._id)));
      if (missing.length && !payload.force) {
        return sendError(res, 409, "SPECIALIST_DOESNT_DO_SERVICE", `${specialist.name} no tiene asignado: ${missing.map((sv) => sv.name).join(", ")}. ¿Agendar de todos modos?`);
      }

      let problem = null;
      const appointment = await withSpecialistLock(specialist._id, async () => {
        problem = await staffSlotProblem({ specialist, startMs, durationMin: resolved.durationMin, bufferMin: resolved.bufferMin, settings, force: Boolean(payload.force) });
        if (problem) return null;
        return Appointment.create({
          appointmentNumber: await nextAppointmentNumber(),
          services: resolved.services.map((sv) => ({ service: sv._id, name: sv.name, durationMin: sv.durationMin, price: sv.price })),
          durationMin: resolved.durationMin,
          bufferMin: resolved.bufferMin,
          total: resolved.total,
          specialist: specialist._id,
          specialistName: specialist.name,
          ...contact,
          start: new Date(startMs),
          end: new Date(startMs + resolved.durationMin * MINUTE),
          blockedUntil: new Date(startMs + (resolved.durationMin + resolved.bufferMin) * MINUTE),
          status,
          source,
          history: [{ type: "status", from: null, to: status, by: "staff", user: req.user.id }],
        });
      });
      if (!appointment) return sendSlotProblem(res, problem);
      if (payload.notifyCustomer !== false) notifyAppointment(appointment, { customer: "booked" });
      await appointment.populate("specialist", "name color");
      return res.status(201).json({ message: "Cita agendada.", appointment: staffView(appointment) });
    } catch (error) {
      if (error?.code === "LOCK_TIMEOUT") return sendError(res, 503, "TRY_AGAIN", error.message);
      return handleMongooseError(sendError, res, error, "Error al agendar la cita.");
    }
  });

  const ensureStaffAppointment = async (req, res, next) => {
    const appointment = await Appointment.findById(req.params.id).catch(() => null);
    if (!appointment) return sendError(res, 404, "APPOINTMENT_NOT_FOUND", "Cita no encontrada.");
    const scope = await scopeOf(req);
    if (scope.none || (scope.specialistId && scope.specialistId !== String(appointment.specialist))) {
      return sendError(res, 404, "APPOINTMENT_NOT_FOUND", "Cita no encontrada.");
    }
    req.appointment = appointment;
    return next();
  };

  const ID = "/:id([0-9a-fA-F]{24})";

  staff.get(ID, ensureStaffAppointment, async (req, res) => {
    await req.appointment.populate("specialist", "name color");
    return res.status(200).json(staffView(req.appointment));
  });

  // PUT /:id — cualquiera de: { start, specialist, services, status,
  // customerName, customerEmail, customerPhone, notes, staffNotes,
  // cancelReason, force }. Si cambia horario, especialista o servicios (o se
  // reactiva una cancelada), se revisa el lugar dentro del candado.
  staff.put(ID, ensureStaffAppointment, async (req, res) => {
    try {
      const payload = req.body || {};
      const settings = await getSettings(mongooseConnection);
      const { appointment } = req;
      const { contact, error: contactError } = validateStaffContact(payload, { partial: true });
      if (contactError) return sendError(res, 400, "VALIDATION_ERROR", contactError);
      if (payload.status !== undefined && !APPOINTMENT_STATUSES.includes(payload.status)) {
        return sendError(res, 400, "VALIDATION_ERROR", `status debe ser uno de: ${APPOINTMENT_STATUSES.join(", ")}.`);
      }

      // Lo nuevo (o lo que ya tenía).
      let startMs = +appointment.start;
      if (payload.start !== undefined) {
        startMs = Date.parse(payload.start);
        if (Number.isNaN(startMs)) return sendError(res, 400, "VALIDATION_ERROR", "start debe ser una fecha y hora válida.");
      }
      let specialist = null;
      const specialistChanged = payload.specialist !== undefined && String(payload.specialist) !== String(appointment.specialist);
      if (specialistChanged || payload.start !== undefined || payload.services !== undefined) {
        const loaded = await loadStaffSpecialist(req, specialistChanged ? payload.specialist : appointment.specialist);
        if (loaded.error) return sendError(res, ...loaded.error);
        specialist = loaded.specialist;
      }
      let resolved = null;
      if (payload.services !== undefined) {
        resolved = await resolveServices(payload.services, { publicOnly: false });
        if (resolved.error) return sendError(res, resolved.error.status, resolved.error.code, resolved.error.message);
      }
      const nextStatus = payload.status ?? appointment.status;
      const reactivating = appointment.status === "cancelled" && nextStatus !== "cancelled";
      const slotChanged = startMs !== +appointment.start || specialistChanged || Boolean(resolved);
      const needsSlotCheck = nextStatus !== "cancelled" && (slotChanged || reactivating);
      if (needsSlotCheck && !specialist) {
        const loaded = await loadStaffSpecialist(req, appointment.specialist);
        if (loaded.error) return sendError(res, ...loaded.error);
        specialist = loaded.specialist;
      }
      const durationMin = resolved ? resolved.durationMin : appointment.durationMin;
      const bufferMin = resolved ? resolved.bufferMin : appointment.bufferMin;
      if (needsSlotCheck && (specialistChanged || resolved) && !payload.force) {
        const serviceIds = resolved ? resolved.services.map((sv) => String(sv._id)) : appointment.services.map((sv) => String(sv.service));
        const missing = serviceIds.filter((id) => !specialist.services.some((sid) => String(sid) === id));
        if (missing.length) {
          return sendError(res, 409, "SPECIALIST_DOESNT_DO_SERVICE", `${specialist.name} no tiene asignados todos los servicios de la cita. ¿Guardar de todos modos?`);
        }
      }

      const apply = async () => {
        const before = { start: appointment.start, specialist: appointment.specialistName, status: appointment.status };
        if (slotChanged) {
          if (specialistChanged) {
            appointment.specialist = specialist._id;
            appointment.specialistName = specialist.name;
          }
          if (resolved) {
            appointment.services = resolved.services.map((sv) => ({ service: sv._id, name: sv.name, durationMin: sv.durationMin, price: sv.price }));
            appointment.total = resolved.total;
          }
          appointment.durationMin = durationMin;
          appointment.bufferMin = bufferMin;
          appointment.start = new Date(startMs);
          appointment.end = new Date(startMs + durationMin * MINUTE);
          appointment.blockedUntil = new Date(startMs + (durationMin + bufferMin) * MINUTE);
          if (startMs !== +before.start || specialistChanged) {
            appointment.history.push({ type: "rescheduled", from: { start: before.start, specialist: before.specialist }, to: { start: appointment.start, specialist: appointment.specialistName }, by: "staff", user: req.user.id });
            if (startMs !== +before.start) resetReminder(appointment);
          }
        }
        if (nextStatus !== appointment.status) {
          appointment.status = nextStatus;
          if (nextStatus === "cancelled") {
            appointment.cancelledAt = new Date();
            appointment.cancelledBy = "staff";
            appointment.cancelReason = asTrimmedString(payload.cancelReason).slice(0, 300);
          } else if (before.status === "cancelled") {
            appointment.cancelledAt = null;
            appointment.cancelledBy = null;
            appointment.cancelReason = "";
            resetReminder(appointment);
          }
          appointment.history.push({ type: "status", from: before.status, to: nextStatus, by: "staff", user: req.user.id });
        }
        Object.assign(appointment, contact);
        return appointment.save();
      };

      const previous = { start: appointment.start, status: appointment.status, specialist: String(appointment.specialist) };
      let problem = null;
      const saved = needsSlotCheck
        ? await withSpecialistLock(specialist._id, async () => {
            problem = await staffSlotProblem({ specialist, startMs, durationMin, bufferMin, settings, excludeId: appointment._id, force: Boolean(payload.force) });
            return problem ? null : apply();
          })
        : await apply();
      if (!saved) return sendSlotProblem(res, problem);
      // Tarjeta de sellos: +1 al completarse, −1 si deja de estarlo.
      if (saved.status !== previous.status) {
        await syncAppointmentStamps(Appointment, mongooseConnection, saved).catch((error) => {
          console.error("No fue posible actualizar los sellos de la cita:", error.message);
        });
      }
      // Aviso a la clienta (uno solo): cancelada > reprogramada > confirmada.
      if (payload.notifyCustomer !== false) {
        const moved = +saved.start !== +previous.start || String(saved.specialist) !== previous.specialist;
        let kind = null;
        if (saved.status === "cancelled" && previous.status !== "cancelled") kind = "cancelled";
        else if (moved && ["pending", "confirmed"].includes(saved.status)) kind = "rescheduled";
        else if (saved.status === "confirmed" && ["pending", "cancelled"].includes(previous.status)) kind = "confirmed";
        if (kind) notifyAppointment(saved, { customer: kind, reason: kind === "cancelled" ? saved.cancelReason : undefined });
      }
      await saved.populate("specialist", "name color");
      return res.status(200).json({ message: "Cita actualizada.", appointment: staffView(saved) });
    } catch (error) {
      if (error?.code === "LOCK_TIMEOUT") return sendError(res, 503, "TRY_AGAIN", error.message);
      return handleMongooseError(sendError, res, error, "Error al actualizar la cita.");
    }
  });

  router.use(staff);
  app.use("/api/appointments", router);
}

// Tareas programadas (lib/scheduler.js): recordatorios cada minuto.
function registerJobs(scheduler, ctx) {
  const runReminders = reminderRunners.get(ctx.mongooseConnection);
  if (runReminders) scheduler.register("appointment-reminders", 60 * 1000, runReminders);
}

module.exports = {
  name: "appointments",
  registerRoutes,
  registerJobs,
  models: {
    Specialist: specialistSchema,
    TimeBlock: timeBlockSchema,
    AppointmentSettings: appointmentSettingsSchema,
    Appointment: appointmentSchema,
  },
  getSettings,
  DEFAULT_SETTINGS,
};
