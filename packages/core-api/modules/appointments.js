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
const { ROLES } = require("../lib/authMiddleware");
const { createModuleAuthorizer } = require("../lib/permissions");

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SHIFTS_PER_DAY = 4;
// Cuentas que se pueden ligar a una especialista (la dueña también puede atender).
const LINKABLE_ROLES = [ROLES.COLLABORATOR, ROLES.STORE_ADMIN];
const MANAGER_ROLES = [ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN];

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
  },
  { timestamps: true }
);

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
    integerIn("slotStepMin", 5, 60);
  if (numberError) return sendError(res, 400, "VALIDATION_ERROR", numberError);
  if (out.slotStepMin !== undefined && ![5, 10, 15, 20, 30, 60].includes(out.slotStepMin)) {
    return sendError(res, 400, "VALIDATION_ERROR", "slotStepMin debe ser 5, 10, 15, 20, 30 o 60.");
  }
  for (const flag of ["autoConfirm", "allowAnySpecialist"]) {
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

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Specialist = getOrCreateModel(mongooseConnection, "Specialist", specialistSchema);
  const TimeBlock = getOrCreateModel(mongooseConnection, "TimeBlock", timeBlockSchema);
  const Settings = getOrCreateModel(mongooseConnection, "AppointmentSettings", appointmentSettingsSchema);
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
      const { notifyEmail, autoConfirm, ...publicSettings } = await getSettings(mongooseConnection);
      return res.status(200).json(publicSettings);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar los ajustes de la agenda.");
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

  router.use(staff);
  app.use("/api/appointments", router);
}

module.exports = {
  name: "appointments",
  registerRoutes,
  models: { Specialist: specialistSchema, TimeBlock: timeBlockSchema, AppointmentSettings: appointmentSettingsSchema },
  getSettings,
  DEFAULT_SETTINGS,
};
