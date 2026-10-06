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
// 4.2 — reseña post-cita: otra tarea manda, `reviewRequestHoursAfter` horas
// después de terminar una cita completada (con correo y de menos de 14 días),
// un correo para calificarla (FRONTEND_URL/cita/<id>?token=…&accion=calificar
// → POST /api/reviews/appointment, modules/reviews.js). Una sola vez
// (`reviewRequestSentAt`); no se manda si ya calificó. Solo corre si `reviews`
// y `appointments` están contratados y `reviewRequestEnabled`.
//
// 5.1 — anticipo SPEI: si los servicios piden anticipo (`Service.deposit`,
// fijo o % del precio) y la tienda tiene una cuenta SPEI, la cita del sitio
// entra `pending_deposit` con `depositAmount` y `depositDueAt` (ahora +
// `depositHours`, nunca después de `depositCutoffHours` antes de la cita).
// La clienta sube su comprobante (lib/paymentProofs.js) → `deposit_review` →
// el staff lo aprueba (→ confirmed, o pending sin confirmación automática) o
// lo rechaza (→ pending_deposit con plazo nuevo). Una tarea programada
// cancela las que vencen sin comprobante y avisa a la clienta y al negocio.
// Los dos estados apartan el horario igual que una cita confirmada.
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
const { paymentProofSchema, proofRecordFrom, findProof, streamProofFile, discardProofFile } = require("../lib/paymentProofs");
const { findUsableCard, debitCard } = require("../lib/giftCards");
const fs = require("fs");
const path = require("path");
const { createPaymentProofUploadMiddlewares, createMediaUploadMiddlewares, resolveUploadsDir } = require("../lib/uploads");
const { findMediaUsages } = require("../lib/mediaUsages");
const {
  appointmentEmailTemplate,
  appointmentBusinessEmailTemplate,
  appointmentReviewRequestEmailTemplate,
  storeSpeiAccount,
} = require("../lib/emailTemplates");
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
const APPOINTMENT_STATUSES = ["pending_deposit", "deposit_review", "pending", "confirmed", "completed", "no_show", "cancelled"];
// Esperan el anticipo (5.1): apartan el horario pero aún no están confirmadas.
const DEPOSIT_STATUSES = ["pending_deposit", "deposit_review"];
const MAX_DEPOSIT_PROOFS = 10;
const MAX_APPOINTMENT_MEDIA = 30;
const SAFE_MEDIA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Plazo mínimo que se le da a la clienta para pagar el anticipo.
const MIN_DEPOSIT_WINDOW_MIN = 30;
// Estados en los que la clienta todavía puede cancelar o reprogramar.
const CHANGEABLE_STATUSES = ["pending_deposit", "deposit_review", "pending", "confirmed"];
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
  reviewRequestEnabled: true,
  reviewRequestHoursAfter: 2,
  depositHours: 24,
  depositCutoffHours: 12,
});
// La invitación a calificar solo se manda a citas que terminaron hace menos de esto.
const REVIEW_REQUEST_MAX_AGE_DAYS = 14;

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
    // Reseña post-cita (4.2, módulo `reviews`): correo X horas después de terminar.
    reviewRequestEnabled: { type: Boolean, default: DEFAULT_SETTINGS.reviewRequestEnabled },
    reviewRequestHoursAfter: { type: Number, min: 1, max: 72, default: DEFAULT_SETTINGS.reviewRequestHoursAfter },
    // Anticipo (5.1): horas para subir el comprobante, y a más tardar N horas
    // antes de la cita.
    depositHours: { type: Number, min: 1, max: 168, default: DEFAULT_SETTINGS.depositHours },
    depositCutoffHours: { type: Number, min: 0, max: 168, default: DEFAULT_SETTINGS.depositCutoffHours },
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
    cancelledBy: { type: String, enum: ["customer", "staff", "system", null], default: null },
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
    // Invitación a calificar (4.2): enviada una sola vez (claimEach).
    reviewRequestSentAt: { type: Date, default: null },
    reviewRequestAttempts: { type: Number, default: 0 },
    // Anticipo (5.1): 0 = no pide. `depositDueAt` = fecha límite para subir el
    // comprobante; `depositPaidAt` = cuándo se validó; `depositExpiredAt` lo
    // marca la tarea que libera las vencidas (claimEach).
    depositAmount: { type: Number, default: 0, min: 0 },
    depositDueAt: { type: Date, default: null },
    depositPaidAt: { type: Date, default: null },
    depositExpiredAt: { type: Date, default: null },
    depositExpireAttempts: { type: Number, default: 0 },
    paymentProofs: { type: [paymentProofSchema], default: [] },
    // Anticipo pagado con tarjeta de regalo (5.2, lib/giftCards.js).
    depositGiftCard: {
      type: new mongoose.Schema(
        {
          card: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCard" },
          code: { type: String, trim: true },
          amount: { type: Number, min: 0 },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // Fotos / videos de la cita (antes y después, el trabajo terminado). Se
    // guardan en la biblioteca de medios (URL pública, modules/media.js), así
    // que solo se suben si la clienta lo autorizó (`mediaConsent`, lo marca
    // el staff). No salen en la vista de la clienta.
    media: {
      type: [
        new mongoose.Schema(
          {
            path: { type: String, required: true, trim: true },
            kind: { type: String, enum: ["image", "gif", "video"], required: true },
            addedAt: { type: Date, default: Date.now },
            addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    mediaConsent: {
      type: new mongoose.Schema(
        {
          given: { type: Boolean, default: false },
          at: { type: Date, default: null },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: true }
);
appointmentSchema.index({ specialist: 1, start: 1 });
appointmentSchema.index({ "media.path": 1 });
// Reseñas y fotos públicas de un servicio (modules/reviews.js, services.js).
appointmentSchema.index({ "services.service": 1, start: -1 });
appointmentSchema.index({ status: 1, depositDueAt: 1, depositExpiredAt: 1 });
appointmentSchema.index({ status: 1, start: 1, reminderSentAt: 1 });
appointmentSchema.index({ status: 1, end: 1, reviewRequestSentAt: 1 });
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
    integerIn("reminderHoursBefore", 1, 72) ||
    integerIn("reviewRequestHoursAfter", 1, 72) ||
    integerIn("depositHours", 1, 168) ||
    integerIn("depositCutoffHours", 0, 168);
  if (numberError) return sendError(res, 400, "VALIDATION_ERROR", numberError);
  if (out.slotStepMin !== undefined && ![5, 10, 15, 20, 30, 60].includes(out.slotStepMin)) {
    return sendError(res, 400, "VALIDATION_ERROR", "slotStepMin debe ser 5, 10, 15, 20, 30 o 60.");
  }
  for (const flag of ["autoConfirm", "allowAnySpecialist", "emailCustomer", "emailBusiness", "reminderEnabled", "reviewRequestEnabled"]) {
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
const reviewRequestRunners = new WeakMap();
const depositExpiryRunners = new WeakMap();

// Anticipo de una lista de servicios (Service.deposit: fijo o % de su
// precio), sin pasar del total.
const depositAmountOf = (services) => {
  const sum = services.reduce((acc, sv) => {
    const dep = sv.deposit || {};
    if (dep.type === "fixed") return acc + (Number(dep.value) || 0);
    if (dep.type === "percent") return acc + ((Number(dep.value) || 0) * sv.price) / 100;
    return acc;
  }, 0);
  const total = services.reduce((acc, sv) => acc + sv.price, 0);
  return Math.round(Math.min(sum, total) * 100) / 100;
};

// Fecha límite del anticipo: ahora + depositHours, pero a más tardar
// depositCutoffHours antes de la cita.
const depositDueAtFor = (startMs, settings, now = Date.now()) =>
  new Date(Math.min(now + settings.depositHours * 60 * MINUTE, startMs - settings.depositCutoffHours * 60 * MINUTE));

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
      const { notifyEmail, autoConfirm, emailCustomer, emailBusiness, reminderEnabled, reminderHoursBefore, reviewRequestEnabled, reviewRequestHoursAfter, ...publicSettings } =
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

  // Cuenta SPEI a la que se transfiere el anticipo (la de la tienda).
  const loadSpeiAccount = async () => {
    const StoreConfig = mongooseConnection.models.StoreConfig;
    const config = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).select("paymentMethods speiPayment").lean() : null;
    return storeSpeiAccount(config);
  };
  const depositConcept = (appointment) => `Cita ${appointment.appointmentNumber}`;

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
      const kind =
        customerKind === "booked" && appointment.status === "pending"
          ? "booked_pending"
          : customerKind === "booked" && appointment.status === "pending_deposit"
            ? "booked_deposit"
            : customerKind;
      const cancelled = kind === "cancelled" || kind === "deposit_expired";
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
        deposit: appointment.depositAmount
          ? {
              amount: appointment.depositAmount,
              dueText: appointment.depositDueAt ? formatWhen(appointment.depositDueAt, settings.timezone) : "",
              spei: await loadSpeiAccount(),
              concept: depositConcept(appointment),
            }
          : undefined,
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

  // ---- Invitación a calificar (4.2) ----
  const sendReviewRequest = async (appointment) => {
    // Si ya calificó (p. ej. con sesión desde su cuenta), no se manda.
    const Review = mongooseConnection.models.Review;
    if (Review && (await Review.exists({ "target.kind": "appointment", "target.id": appointment._id }))) return;
    const manageUrl = customerAppointmentUrl(appointment);
    if (!manageUrl) throw new Error("Falta FRONTEND_URL para el enlace de calificar.");
    const settings = await getSettings(mongooseConnection);
    const { branding } = await loadBranding();
    const { subject, html, text } = appointmentReviewRequestEmailTemplate({
      appointment,
      when: formatWhen(appointment.start, settings.timezone),
      branding,
      rateUrl: `${manageUrl}&accion=calificar`,
    });
    await notify({ channel: "email", to: appointment.customerEmail, subject, text, html });
  };

  const runReviewRequests = async ({ now = new Date() } = {}) => {
    if (!(await isModuleContracted(mongooseConnection, "reviews")) || !(await isModuleContracted(mongooseConnection, "appointments"))) {
      return { skipped: "not_contracted" };
    }
    const settings = await getSettings(mongooseConnection);
    if (!settings.reviewRequestEnabled) return { skipped: "disabled" };
    return claimEach({
      Model: Appointment,
      filter: {
        status: "completed",
        customerEmail: { $nin: ["", null] },
        end: {
          $lte: new Date(+now - settings.reviewRequestHoursAfter * 60 * MINUTE),
          $gt: new Date(+now - REVIEW_REQUEST_MAX_AGE_DAYS * 24 * 60 * MINUTE),
        },
      },
      markField: "reviewRequestSentAt",
      attemptsField: "reviewRequestAttempts",
      sort: { end: 1 },
      now,
      handle: sendReviewRequest,
    });
  };
  reviewRequestRunners.set(mongooseConnection, runReviewRequests);

  // ---- Anticipos vencidos (5.1) ----
  // Cancela las citas que siguen esperando su anticipo después de la fecha
  // límite (libera el horario) y avisa a la clienta y al negocio. Una con
  // comprobante en revisión no vence: espera al staff.
  const DEPOSIT_EXPIRED_REASON = "No se recibió el anticipo a tiempo.";
  const runDepositExpiry = async ({ now = new Date() } = {}) => {
    if (!(await isModuleContracted(mongooseConnection, "appointments"))) return { skipped: "not_contracted" };
    return claimEach({
      Model: Appointment,
      filter: { status: "pending_deposit", depositDueAt: { $ne: null, $lte: now } },
      markField: "depositExpiredAt",
      attemptsField: "depositExpireAttempts",
      sort: { depositDueAt: 1 },
      now,
      handle: async (appointment) => {
        // Condicionado al estado: si entre tanto subió su comprobante, no se toca.
        const cancelled = await Appointment.findOneAndUpdate(
          { _id: appointment._id, status: "pending_deposit" },
          {
            $set: { status: "cancelled", cancelledAt: now, cancelledBy: "system", cancelReason: DEPOSIT_EXPIRED_REASON },
            $push: { history: { type: "status", from: "pending_deposit", to: "cancelled", by: "system", at: now } },
          },
          { new: true }
        );
        if (cancelled) notifyAppointment(cancelled, { customer: "deposit_expired", business: "deposit_expired", reason: DEPOSIT_EXPIRED_REASON });
      },
    });
  };
  depositExpiryRunners.set(mongooseConnection, runDepositExpiry);

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
      depositAmount: depositAmountOf(services),
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
  const customerView = (a, settings, spei = null) => ({
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
    // Anticipo (5.1): la cuenta solo mientras se espera.
    deposit: a.depositAmount
      ? {
          amount: a.depositAmount,
          dueAt: a.depositDueAt,
          paidAt: a.depositPaidAt,
          concept: depositConcept(a),
          spei: DEPOSIT_STATUSES.includes(a.status) ? spei : null,
          giftCard: a.depositGiftCard?.amount ? { code: a.depositGiftCard.code, amount: a.depositGiftCard.amount } : null,
        }
      : null,
    paymentProofs: (a.paymentProofs || []).map((p) => ({
      _id: p._id,
      status: p.status,
      uploadedAt: p.uploadedAt,
      rejectReason: p.status === "rejected" ? p.rejectReason : undefined,
    })),
    canUploadProof: DEPOSIT_STATUSES.includes(a.status) && (a.paymentProofs || []).length < MAX_DEPOSIT_PROOFS,
  });
  // Con la cuenta SPEI si la cita espera su anticipo.
  const customerPayload = async (a, settings) =>
    customerView(a, settings, DEPOSIT_STATUSES.includes(a.status) ? await loadSpeiAccount() : null);

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
      const base = { timezone: settings.timezone, durationMin: resolved.durationMin, total: resolved.total, depositAmount: resolved.depositAmount };
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

      // Anticipo: solo si la tienda tiene a dónde recibirlo.
      let deposit = null;
      if (resolved.depositAmount > 0 && (await loadSpeiAccount())) {
        const dueAt = depositDueAtFor(startMs, settings);
        if (+dueAt - Date.now() < MIN_DEPOSIT_WINDOW_MIN * MINUTE) {
          return sendError(
            res,
            409,
            "DEPOSIT_TOO_LATE",
            `Esta cita pide anticipo: agéndala con al menos ${settings.depositCutoffHours + 1} horas de anticipación o llámanos.`
          );
        }
        deposit = { depositAmount: resolved.depositAmount, depositDueAt: dueAt };
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
            status: deposit ? "pending_deposit" : settings.autoConfirm ? "confirmed" : "pending",
            source: "web",
            ...(deposit || {}),
          }),
      });
      if (!appointment) {
        return sendError(res, 409, "SLOT_TAKEN", "Ese horario ya no está disponible. Elige otro, por favor.");
      }
      notifyAppointment(appointment, { customer: "booked", business: "new" });
      return res.status(201).json({
        message:
          appointment.status === "confirmed"
            ? "¡Tu cita está agendada!"
            : appointment.status === "pending_deposit"
              ? "Tu horario quedó apartado: transfiere el anticipo y sube tu comprobante para confirmarla."
              : "Recibimos tu cita; te avisaremos cuando la confirmemos.",
        appointment: await customerPayload(appointment, settings),
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
    return res.status(200).json({ appointment: await customerPayload(req.appointment, settings) });
  });

  // ---- Anticipo (5.1): comprobantes ----
  // La nueva fecha límite al reprogramar o al rechazar un comprobante: la
  // regla normal, pero nunca menos de MIN_DEPOSIT_WINDOW_MIN desde ahora.
  const refreshedDueAt = (startMs, settings, { keepEarlier } = {}) => {
    let due = +depositDueAtFor(startMs, settings);
    if (keepEarlier) due = Math.min(due, +keepEarlier);
    return new Date(Math.max(due, Date.now() + MIN_DEPOSIT_WINDOW_MIN * MINUTE));
  };

  // Solo a una cita que espera su anticipo.
  const ensureAwaitingDeposit = (req, res, next) => {
    const { appointment } = req;
    if (!DEPOSIT_STATUSES.includes(appointment.status) || !appointment.depositAmount) {
      return sendError(res, 409, "APPOINTMENT_NOT_AWAITING_DEPOSIT", "Esta cita no está esperando un anticipo.");
    }
    if ((appointment.paymentProofs || []).length >= MAX_DEPOSIT_PROOFS) {
      return sendError(res, 409, "TOO_MANY_PAYMENT_PROOFS", `Esta cita ya tiene ${MAX_DEPOSIT_PROOFS} comprobantes; comunícate con nosotros.`);
    }
    return next();
  };

  const proofRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    code: "RATE_LIMIT_PAYMENT_PROOF_EXCEEDED",
    message: "Demasiados comprobantes enviados. Intenta de nuevo en unos minutos.",
    sendError,
  });
  const proofUpload = createPaymentProofUploadMiddlewares({ fieldName: "file", sendError });

  // Guarda el comprobante y pasa la cita a "en revisión".
  const attachDepositProof = async (appointment, savedProof, { uploadedBy, userId }) => {
    appointment.paymentProofs.push(proofRecordFrom(savedProof, { uploadedBy, userId }));
    if (appointment.status === "pending_deposit") {
      appointment.history.push({ type: "status", from: "pending_deposit", to: "deposit_review", by: uploadedBy, user: userId || null });
      appointment.status = "deposit_review";
    }
    return appointment.save();
  };

  // POST /public/:id/deposit-gift-card { code } — pagar el anticipo con una
  // tarjeta de regalo (debe alcanzar el anticipo completo). Confirma la cita
  // al momento (o la deja por confirmar si la agenda no confirma sola).
  router.post("/public/:id/deposit-gift-card", publicRateLimiter, resolveCustomerAccess, ensureAwaitingDeposit, async (req, res) => {
    try {
      const { appointment } = req;
      const found = await findUsableCard(mongooseConnection, req.body?.code);
      if (found.error) return sendError(res, found.error.status, found.error.code, found.error.message);
      if (found.card.balance < appointment.depositAmount) {
        return sendError(
          res,
          409,
          "GIFT_CARD_INSUFFICIENT",
          `La tarjeta tiene $${found.card.balance.toLocaleString("es-MX")} y el anticipo es de $${appointment.depositAmount.toLocaleString("es-MX")}.`
        );
      }
      const charged = await debitCard(mongooseConnection, found.card._id, appointment.depositAmount, {
        appointment: appointment._id,
        note: `Anticipo de la cita #${appointment.appointmentNumber}`,
      });
      if (!charged) return sendError(res, 409, "GIFT_CARD_INSUFFICIENT", "El saldo de la tarjeta cambió. Revisa e intenta de nuevo.");
      const settings = await getSettings(mongooseConnection);
      const from = appointment.status;
      appointment.depositGiftCard = { card: found.card._id, code: found.card.code, amount: appointment.depositAmount };
      appointment.depositPaidAt = new Date();
      appointment.status = settings.autoConfirm ? "confirmed" : "pending";
      appointment.history.push({ type: "status", from, to: appointment.status, by: "customer" });
      await appointment.save();
      notifyAppointment(appointment, { customer: "deposit_approved" });
      return res.status(200).json({ message: "Pagaste el anticipo con tu tarjeta de regalo.", appointment: await customerPayload(appointment, settings) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al pagar el anticipo con la tarjeta.");
    }
  });

  // POST /public/:id/deposit-proof — la clienta (token de la cita o sesión)
  // sube su comprobante: multipart con el archivo en `file` (JPG/PNG/PDF).
  router.post(
    "/public/:id/deposit-proof",
    proofRateLimiter,
    resolveCustomerAccess,
    ensureAwaitingDeposit,
    proofUpload.uploadMiddleware,
    proofUpload.sanitizeAndStoreMiddleware,
    async (req, res) => {
      try {
        const settings = await getSettings(mongooseConnection);
        const appointment = await attachDepositProof(req.appointment, req.savedProof, { uploadedBy: "customer" });
        notifyAppointment(appointment, { business: "deposit_proof" });
        return res.status(201).json({
          message: "Recibimos tu comprobante. Te avisaremos en cuanto lo validemos.",
          appointment: await customerPayload(appointment, settings),
        });
      } catch (error) {
        await discardProofFile(req.savedProof?.fileName);
        return handleMongooseError(sendError, res, error, "Error al guardar el comprobante.");
      }
    }
  );

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
          if (appointment.status === "pending_deposit" && appointment.depositDueAt) {
            appointment.depositDueAt = refreshedDueAt(startMs, settings, { keepEarlier: appointment.depositDueAt });
          }
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

  // GET /list?when=today|upcoming|past&status=&specialist=&q=&page=&limit= —
  // listado paginado sin límite de rango (la vista "Citas" del panel, junto a la
  // agenda). Próximas: desde ahora, la más cercana primero; pasadas: la más
  // reciente primero; hoy: el día en la zona de la agenda. Mismo alcance que
  // la agenda (colaboradora: solo su especialista). `counts` = cuántas hay en
  // cada pestaña con los mismos filtros.
  const LIST_WHEN = ["today", "upcoming", "past"];
  staff.get("/list", async (req, res) => {
    try {
      const when = LIST_WHEN.includes(req.query.when) ? req.query.when : "upcoming";
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const empty = { items: [], total: 0, page, pages: 0, counts: { today: 0, upcoming: 0, past: 0 } };

      const base = {};
      const scope = await scopeOf(req);
      if (scope.none) return res.status(200).json(empty);
      if (scope.specialistId) base.specialist = scope.specialistId;
      else if (req.query.specialist) {
        if (!isValidObjectId(req.query.specialist)) return sendError(res, 400, "VALIDATION_ERROR", "specialist no válido.");
        base.specialist = req.query.specialist;
      }
      if (req.query.status) {
        const statuses = String(req.query.status).split(",").filter((st) => APPOINTMENT_STATUSES.includes(st));
        if (statuses.length) base.status = { $in: statuses };
      }
      const q = asTrimmedString(req.query.q).slice(0, 80);
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const digits = q.replace(/\D/g, "");
        base.$or = [{ customerName: rx }, { customerEmail: rx }, { "services.name": rx }, ...(digits.length >= 3 ? [{ customerPhone: new RegExp(digits) }] : [])];
      }

      const settings = await getSettings(mongooseConnection);
      const now = new Date();
      const today = utcToLocal(now.getTime(), settings.timezone).date;
      const dayStart = new Date(localToUtc(today, "00:00", settings.timezone));
      const dayEnd = new Date(localToUtc(addDays(today, 1), "00:00", settings.timezone));
      const ranges = {
        today: { start: { $gte: dayStart, $lt: dayEnd } },
        upcoming: { start: { $gte: now } },
        past: { start: { $lt: now } },
      };
      const filter = { ...base, ...ranges[when] };

      const [items, today_, upcoming, past] = await Promise.all([
        Appointment.find(filter)
          .sort({ start: when === "past" ? -1 : 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate("specialist", "name color")
          .lean(),
        ...LIST_WHEN.map((w) => Appointment.countDocuments({ ...base, ...ranges[w] })),
      ]);
      const counts = { today: today_, upcoming, past };
      return res.status(200).json({ items: items.map(staffView), total: counts[when], page, pages: Math.ceil(counts[when] / limit), counts, timezone: settings.timezone });
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
      let status = payload.status === "pending" ? "pending" : "confirmed";

      const resolved = await resolveServices(payload.services, { publicOnly: false });
      if (resolved.error) return sendError(res, resolved.error.status, resolved.error.code, resolved.error.message);
      // Anticipo opcional en el alta manual (`requireDeposit: true`): queda
      // esperando el comprobante igual que una cita del sitio.
      let deposit = {};
      if (payload.requireDeposit === true) {
        if (!(resolved.depositAmount > 0)) {
          return sendError(res, 400, "DEPOSIT_NOT_CONFIGURED", "Ninguno de esos servicios pide anticipo (configúralo en Servicios).");
        }
        status = "pending_deposit";
        deposit = { depositAmount: resolved.depositAmount, depositDueAt: refreshedDueAt(startMs, settings) };
      }
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
          ...deposit,
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

  const respondWithAppointment = async (res, status, appointment, message) => {
    await appointment.populate("specialist", "name color");
    return res.status(status).json({ message, appointment: staffView(appointment) });
  };

  // ---- Fotos y videos de la cita ----
  // Van a la biblioteca de medios (URL pública, modules/media.js), así que
  // primero el staff marca que la clienta autorizó subirlas al sitio
  // (`mediaConsent`). Sin eso, 409 MEDIA_CONSENT_REQUIRED.
  staff.put(`${ID}/media-consent`, ensureStaffAppointment, async (req, res) => {
    try {
      const given = req.body?.given;
      if (typeof given !== "boolean") return sendError(res, 400, "VALIDATION_ERROR", "given debe ser true o false.");
      const { appointment } = req;
      // Retirar el permiso con fotos puestas: primero se quitan (y se borran
      // de la biblioteca), para no dejar publicado lo que ya no autorizó.
      if (!given && appointment.media.length) {
        return sendError(res, 409, "MEDIA_ATTACHED", "Primero quita las fotos y videos de la cita; al quitarlos se borran de la biblioteca de medios.");
      }
      appointment.mediaConsent = { given, at: new Date(), by: req.user.id };
      await appointment.save();
      return respondWithAppointment(res, 200, appointment, given ? "Autorización registrada." : "Autorización retirada.");
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al guardar la autorización.");
    }
  });

  const mediaUpload = createMediaUploadMiddlewares({ fieldName: "media", filePrefix: "media", maxImageSizeMB: 10, maxVideoSizeMB: 50, sendError });
  // Antes de leer el archivo: sin autorización o con el máximo, ni se sube.
  const canAddMedia = (req, res, next) => {
    if (!req.appointment.mediaConsent?.given) {
      return sendError(res, 409, "MEDIA_CONSENT_REQUIRED", "Primero marca que la clienta autorizó subir sus fotos al sitio.");
    }
    if (req.appointment.media.length >= MAX_APPOINTMENT_MEDIA) {
      return sendError(res, 409, "MEDIA_LIMIT", `Una cita admite hasta ${MAX_APPOINTMENT_MEDIA} fotos o videos.`);
    }
    return next();
  };
  const discardMediaFile = async (fileName) => {
    const uploadsDir = resolveUploadsDir();
    if (!fileName || !uploadsDir) return;
    await fs.promises.unlink(path.join(uploadsDir, fileName)).catch(() => {});
    await mongooseConnection.models.Media?.deleteOne({ fileName }).catch(() => {});
  };

  staff.post(`${ID}/media`, ensureStaffAppointment, canAddMedia, mediaUpload.uploadMiddleware, mediaUpload.sanitizeAndStoreMiddleware, async (req, res) => {
    if (!req.savedMedia) return sendError(res, 400, "FILE_REQUIRED", "Se requiere un archivo en el campo media.");
    const { appointment } = req;
    const { fileName, path: mediaPath, kind } = req.savedMedia;
    try {
      // En la biblioteca con un título que diga de qué cita es.
      await mongooseConnection.models.Media?.create({
        fileName,
        title: `Cita #${appointment.appointmentNumber} · ${appointment.customerName}`.slice(0, 200),
        altText: appointment.services.map((sv) => sv.name).join(" + ").slice(0, 500),
        uploadedBy: req.user.id,
      });
      // Condicionado: si en medio retiraron el permiso o se llenó, no entra.
      const updated = await Appointment.findOneAndUpdate(
        { _id: appointment._id, "mediaConsent.given": true, [`media.${MAX_APPOINTMENT_MEDIA - 1}`]: { $exists: false } },
        { $push: { media: { path: mediaPath, kind, addedBy: req.user.id } } },
        { new: true }
      );
      if (!updated) {
        await discardMediaFile(fileName);
        return sendError(res, 409, "MEDIA_CONSENT_REQUIRED", "La cita ya no admite fotos (sin autorización o llena).");
      }
      return respondWithAppointment(res, 201, updated, "Agregado a la cita y a la biblioteca de medios.");
    } catch (error) {
      await discardMediaFile(fileName);
      return handleMongooseError(sendError, res, error, "Error al guardar el archivo.");
    }
  });

  // Quitar: sale de la cita y, si nada más lo usa (producto, Configurar
  // tienda, galería del sitio, otra cita…), también se borra de la biblioteca.
  staff.delete(`${ID}/media/:fileName`, ensureStaffAppointment, async (req, res) => {
    try {
      const { fileName } = req.params;
      if (!SAFE_MEDIA_FILE.test(fileName || "")) return sendError(res, 400, "INVALID_FILE_NAME", "Nombre de archivo no válido.");
      const mediaPath = `uploads/${fileName}`;
      const { appointment } = req;
      if (!appointment.media.some((m) => m.path === mediaPath)) return sendError(res, 404, "MEDIA_NOT_FOUND", "Ese archivo no está en la cita.");
      const updated = await Appointment.findByIdAndUpdate(appointment._id, { $pull: { media: { path: mediaPath } } }, { new: true });
      const usages = await findMediaUsages(mongooseConnection, mediaPath, { exceptAppointment: appointment._id });
      const doc = await mongooseConnection.models.Media?.findOne({ fileName }).select("inGallery").lean();
      const keep = usages.length > 0 || Boolean(doc?.inGallery);
      if (!keep) await discardMediaFile(fileName);
      return respondWithAppointment(
        res,
        200,
        updated,
        keep ? "Se quitó de la cita; sigue en la biblioteca de medios porque se usa en otro lugar." : "Se quitó de la cita y se borró de la biblioteca de medios."
      );
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al quitar el archivo.");
    }
  });

  // ---- Reseñas (módulo reviews) ----
  // La de esta cita y el historial de la clienta (por cuenta o correo): otras
  // citas y productos. Si la tienda no tiene Reseñas contratado, `enabled: false`.
  staff.get(`${ID}/reviews`, ensureStaffAppointment, async (req, res) => {
    try {
      const Review = mongooseConnection.models.Review;
      if (!Review || !(await isModuleContracted(mongooseConnection, "reviews"))) return res.status(200).json({ enabled: false, review: null, history: [] });
      const { appointment } = req;
      const review = await Review.findOne({ "target.kind": "appointment", "target.id": appointment._id }).lean();
      const owner = [];
      if (appointment.customer) owner.push({ customer: appointment.customer });
      if (appointment.customerEmail) owner.push({ customerEmail: appointment.customerEmail });
      const history = owner.length
        ? await Review.find({ $or: owner, ...(review ? { _id: { $ne: review._id } } : {}) }).sort({ createdAt: -1 }).limit(20).lean()
        : [];
      const productIds = history.filter((r) => r.target.kind === "product").map((r) => r.target.id);
      const products = productIds.length && mongooseConnection.models.Product ? await mongooseConnection.models.Product.find({ _id: { $in: productIds } }).select("name").lean() : [];
      const productName = new Map(products.map((p) => [String(p._id), p.name]));
      const view = (r) => ({
        _id: r._id,
        kind: r.target.kind,
        targetId: r.target.id,
        label:
          r.target.kind === "appointment"
            ? `Cita #${r.appointmentInfo?.appointmentNumber ?? "?"}${r.appointmentInfo?.services?.length ? ` · ${r.appointmentInfo.services.join(" + ")}` : ""}`
            : productName.get(String(r.target.id)) || "Producto",
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        rejectionReason: r.rejectionReason,
        createdAt: r.createdAt,
      });
      return res.status(200).json({ enabled: true, review: review ? view(review) : null, history: history.map(view) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar las reseñas.");
    }
  });

  // ---- Anticipo (5.1) ----
  // El staff sube el comprobante que la clienta mandó por WhatsApp o correo.
  staff.post(
    `${ID}/deposit-proof`,
    ensureStaffAppointment,
    ensureAwaitingDeposit,
    proofUpload.uploadMiddleware,
    proofUpload.sanitizeAndStoreMiddleware,
    async (req, res) => {
      try {
        const appointment = await attachDepositProof(req.appointment, req.savedProof, { uploadedBy: "staff", userId: req.user.id });
        await appointment.populate("specialist", "name color");
        return res.status(201).json({ message: "Comprobante agregado.", appointment: staffView(appointment) });
      } catch (error) {
        await discardProofFile(req.savedProof?.fileName);
        return handleMongooseError(sendError, res, error, "Error al guardar el comprobante.");
      }
    }
  );

  staff.get(`${ID}/deposit-proofs/:proofId([0-9a-fA-F]{24})/file`, ensureStaffAppointment, async (req, res) => {
    const proof = findProof(req.appointment, req.params.proofId);
    if (!proof) return sendError(res, 404, "PAYMENT_PROOF_NOT_FOUND", "Comprobante no encontrado.");
    const sent = await streamProofFile(res, proof);
    if (!sent) return sendError(res, 404, "PAYMENT_PROOF_FILE_NOT_FOUND", "El archivo del comprobante ya no existe.");
    return undefined;
  });

  // { decision: "approve" | "reject", reason } — aprobar confirma la cita
  // (o la deja por confirmar si la agenda no confirma sola); rechazar la
  // regresa a "esperando anticipo" con un plazo nuevo.
  staff.post(`${ID}/deposit-proofs/:proofId([0-9a-fA-F]{24})/review`, ensureStaffAppointment, async (req, res) => {
    try {
      const { appointment } = req;
      const decision = asTrimmedString(req.body?.decision);
      const reason = asTrimmedString(req.body?.reason).slice(0, 500);
      if (!["approve", "reject"].includes(decision)) {
        return sendError(res, 400, "VALIDATION_ERROR", 'decision debe ser "approve" o "reject".');
      }
      if (decision === "reject" && !reason) {
        return sendError(res, 400, "VALIDATION_ERROR", "Escribe el motivo del rechazo (se le envía a la clienta).");
      }
      const proof = findProof(appointment, req.params.proofId);
      if (!proof) return sendError(res, 404, "PAYMENT_PROOF_NOT_FOUND", "Comprobante no encontrado.");
      if (proof.status !== "pending") return sendError(res, 409, "PAYMENT_PROOF_ALREADY_REVIEWED", "Este comprobante ya fue revisado.");

      const settings = await getSettings(mongooseConnection);
      const previousStatus = appointment.status;
      proof.status = decision === "approve" ? "approved" : "rejected";
      proof.reviewedBy = req.user.id;
      proof.reviewedAt = new Date();
      if (decision === "reject") proof.rejectReason = reason;

      if (decision === "approve") {
        appointment.depositPaidAt = appointment.depositPaidAt || new Date();
        if (DEPOSIT_STATUSES.includes(previousStatus)) appointment.status = settings.autoConfirm ? "confirmed" : "pending";
      } else if (previousStatus === "deposit_review" && !appointment.paymentProofs.some((p) => p.status === "pending")) {
        appointment.status = "pending_deposit";
        appointment.depositDueAt = refreshedDueAt(+appointment.start, settings);
        appointment.depositExpiredAt = null;
        appointment.depositExpireAttempts = 0;
      }
      if (appointment.status !== previousStatus) {
        appointment.history.push({ type: "status", from: previousStatus, to: appointment.status, by: "staff", user: req.user.id });
      }
      await appointment.save();
      if (decision === "approve" && appointment.status !== previousStatus) notifyAppointment(appointment, { customer: "deposit_approved" });
      if (decision === "reject") notifyAppointment(appointment, { customer: "deposit_rejected", reason });
      await appointment.populate("specialist", "name color");
      return res.status(200).json({
        message: decision === "approve" ? "Anticipo aprobado." : "Comprobante rechazado.",
        appointment: staffView(appointment),
      });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al revisar el comprobante.");
    }
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
          if (appointment.status === "pending_deposit" && appointment.depositDueAt && startMs !== +before.start) {
            appointment.depositDueAt = refreshedDueAt(startMs, settings, { keepEarlier: appointment.depositDueAt });
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
          // Anticipo: confirmarla a mano = el negocio ya lo recibió (efectivo,
          // otra cuenta…); regresarla a "esperando anticipo" da plazo nuevo.
          if (DEPOSIT_STATUSES.includes(before.status) && ["pending", "confirmed", "completed"].includes(nextStatus) && appointment.depositAmount) {
            appointment.depositPaidAt = appointment.depositPaidAt || new Date();
          }
          if (nextStatus === "pending_deposit") {
            if (!appointment.depositAmount) throw Object.assign(new Error("sin anticipo"), { code: "NO_DEPOSIT" });
            appointment.depositPaidAt = null;
            appointment.depositDueAt = refreshedDueAt(+appointment.start, settings);
            appointment.depositExpiredAt = null;
            appointment.depositExpireAttempts = 0;
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
        else if (moved && CHANGEABLE_STATUSES.includes(saved.status)) kind = "rescheduled";
        else if (saved.status === "confirmed" && ["pending", "cancelled", ...DEPOSIT_STATUSES].includes(previous.status)) kind = "confirmed";
        if (kind) notifyAppointment(saved, { customer: kind, reason: kind === "cancelled" ? saved.cancelReason : undefined });
      }
      await saved.populate("specialist", "name color");
      return res.status(200).json({ message: "Cita actualizada.", appointment: staffView(saved) });
    } catch (error) {
      if (error?.code === "LOCK_TIMEOUT") return sendError(res, 503, "TRY_AGAIN", error.message);
      if (error?.code === "NO_DEPOSIT") {
        return sendError(res, 400, "DEPOSIT_NOT_CONFIGURED", "Esta cita no tiene anticipo; agrégalo en el alta o en los servicios.");
      }
      return handleMongooseError(sendError, res, error, "Error al actualizar la cita.");
    }
  });

  router.use(staff);
  app.use("/api/appointments", router);
}

// Tareas programadas (lib/scheduler.js): recordatorios cada minuto,
// invitaciones a calificar cada 15 min y anticipos vencidos cada 5 min.
function registerJobs(scheduler, ctx) {
  const runReminders = reminderRunners.get(ctx.mongooseConnection);
  if (runReminders) scheduler.register("appointment-reminders", 60 * 1000, runReminders);
  const runReviewRequests = reviewRequestRunners.get(ctx.mongooseConnection);
  if (runReviewRequests) scheduler.register("appointment-review-requests", 15 * 60 * 1000, runReviewRequests);
  const runDepositExpiry = depositExpiryRunners.get(ctx.mongooseConnection);
  if (runDepositExpiry) scheduler.register("appointment-deposit-expiry", 5 * 60 * 1000, runDepositExpiry);
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
