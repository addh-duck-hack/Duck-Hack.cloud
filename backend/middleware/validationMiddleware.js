const mongoose = require("mongoose");
const { isValidRole } = require("./authMiddleware");
const { sendError } = require("../utils/httpResponses");
const { HOSTING_PLANS, HOSTING_PLAN_IDS } = require("../utils/hostingPlans");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

const validateEmail = (email) => EMAIL_REGEX.test(asTrimmedString(email));

const badRequest = (res, code, message, details) => sendError(res, 400, code, message, details);

const validateObjectIdParam = (paramName) => (req, res, next) => {
  const value = req.params?.[paramName];
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return badRequest(res, "INVALID_OBJECT_ID", `${paramName} no válido`);
  }
  return next();
};

const validateRegisterPayload = (req, res, next) => {
  const name = asTrimmedString(req.body?.name);
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const password = asTrimmedString(req.body?.password);

  if (!name) return badRequest(res, "VALIDATION_ERROR", "El nombre es requerido.");
  if (name.length < 2 || name.length > 80) {
    return badRequest(res, "VALIDATION_ERROR", "El nombre debe tener entre 2 y 80 caracteres.");
  }

  if (!email) return badRequest(res, "VALIDATION_ERROR", "El correo electrónico es requerido.");
  if (!validateEmail(email)) return badRequest(res, "VALIDATION_ERROR", "El correo electrónico no es válido.");

  if (!password) return badRequest(res, "VALIDATION_ERROR", "La contraseña es requerida.");
  if (password.length < 6) {
    return badRequest(res, "VALIDATION_ERROR", "La contraseña debe tener al menos 6 caracteres.");
  }

  req.body.name = name;
  req.body.email = email;
  req.body.password = password;
  return next();
};

const validateLoginPayload = (req, res, next) => {
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const password = asTrimmedString(req.body?.password);

  if (!email) return badRequest(res, "VALIDATION_ERROR", "El correo electrónico es requerido.");
  if (!validateEmail(email)) return badRequest(res, "VALIDATION_ERROR", "El correo electrónico no es válido.");
  if (!password) return badRequest(res, "VALIDATION_ERROR", "La contraseña es requerida.");

  req.body.email = email;
  req.body.password = password;
  return next();
};

const validateUpdateUserPayload = (req, res, next) => {
  const { name, email, role } = req.body || {};

  if (email !== undefined) {
    return badRequest(res, "EMAIL_CHANGE_NOT_ALLOWED", "El correo electrónico no puede modificarse.");
  }

  if (name !== undefined) {
    const normalizedName = asTrimmedString(name);
    if (!normalizedName) return badRequest(res, "VALIDATION_ERROR", "El nombre no puede estar vacío.");
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      return badRequest(res, "VALIDATION_ERROR", "El nombre debe tener entre 2 y 80 caracteres.");
    }
    req.body.name = normalizedName;
  }

  if (role !== undefined) {
    const normalizedRole = asTrimmedString(role);
    if (!isValidRole(normalizedRole)) {
      return badRequest(res, "INVALID_ROLE", "Rol no válido");
    }
    req.body.role = normalizedRole;
  }

  return next();
};

const validatePasswordChangePayload = (req, res, next) => {
  const currentPassword = asTrimmedString(req.body?.currentPassword);
  const newPassword = asTrimmedString(req.body?.newPassword);

  if (!currentPassword || !newPassword) {
    return badRequest(res, "VALIDATION_ERROR", "currentPassword y newPassword son requeridos.");
  }

  if (newPassword.length < 6) {
    return badRequest(res, "VALIDATION_ERROR", "La nueva contraseña debe tener al menos 6 caracteres.");
  }

  if (currentPassword === newPassword) {
    return badRequest(res, "VALIDATION_ERROR", "La nueva contraseña debe ser diferente a la contraseña actual.");
  }

  req.body.currentPassword = currentPassword;
  req.body.newPassword = newPassword;
  return next();
};

const validateContactEmailPayload = (req, res, next) => {
  const fullName = asTrimmedString(req.body?.fullName);
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const phone = asTrimmedString(req.body?.phone);
  const service = asTrimmedString(req.body?.service);
  const message = asTrimmedString(req.body?.message);

  if (!fullName) return badRequest(res, "VALIDATION_ERROR", "El nombre completo es requerido.");
  if (fullName.length < 2 || fullName.length > 100) {
    return badRequest(res, "VALIDATION_ERROR", "El nombre completo debe tener entre 2 y 100 caracteres.");
  }

  if (!email) return badRequest(res, "VALIDATION_ERROR", "El correo electrónico es requerido.");
  if (!validateEmail(email)) return badRequest(res, "VALIDATION_ERROR", "El correo electrónico no es válido.");

  if (!service) return badRequest(res, "VALIDATION_ERROR", "El servicio es requerido.");
  if (service.length > 120) return badRequest(res, "VALIDATION_ERROR", "El servicio es demasiado largo.");

  if (!message) return badRequest(res, "VALIDATION_ERROR", "El mensaje es requerido.");
  if (message.length < 10 || message.length > 2000) {
    return badRequest(res, "VALIDATION_ERROR", "El mensaje debe tener entre 10 y 2000 caracteres.");
  }

  if (phone && phone.length > 30) {
    return badRequest(res, "VALIDATION_ERROR", "El teléfono es demasiado largo.");
  }

  req.body.fullName = fullName;
  req.body.email = email;
  req.body.phone = phone;
  req.body.service = service;
  req.body.message = message;
  return next();
};

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;
const SLUG_REGEX = /^[a-z0-9-]+$/;

const validateStoreConfigPayload = (req, res, next) => {
  const payload = req.body || {};

  if (payload.storeName !== undefined) {
    const storeName = asTrimmedString(payload.storeName);
    if (!storeName || storeName.length < 2 || storeName.length > 120) {
      return badRequest(
        res,
        "VALIDATION_ERROR",
        "storeName debe tener entre 2 y 120 caracteres."
      );
    }
    req.body.storeName = storeName;
  }

  if (payload.storeSlug !== undefined) {
    const storeSlug = asTrimmedString(payload.storeSlug).toLowerCase();
    if (!storeSlug || storeSlug.length < 2 || storeSlug.length > 80 || !SLUG_REGEX.test(storeSlug)) {
      return badRequest(
        res,
        "VALIDATION_ERROR",
        "storeSlug solo permite minúsculas, números y guiones (2-80 chars)."
      );
    }
    req.body.storeSlug = storeSlug;
  }

  if (payload.contactEmail !== undefined) {
    const contactEmail = asTrimmedString(payload.contactEmail).toLowerCase();
    if (contactEmail && !validateEmail(contactEmail)) {
      return badRequest(res, "VALIDATION_ERROR", "contactEmail no es válido.");
    }
    req.body.contactEmail = contactEmail;
  }

  if (payload.contactPhone !== undefined) {
    const contactPhone = asTrimmedString(payload.contactPhone);
    if (contactPhone.length > 30) {
      return badRequest(res, "VALIDATION_ERROR", "contactPhone excede 30 caracteres.");
    }
    req.body.contactPhone = contactPhone;
  }

  if (payload.logoUrl !== undefined) {
    const logoUrl = asTrimmedString(payload.logoUrl);
    if (logoUrl.length > 300) {
      return badRequest(res, "VALIDATION_ERROR", "logoUrl excede 300 caracteres.");
    }
    req.body.logoUrl = logoUrl;
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== "boolean") {
    return badRequest(res, "VALIDATION_ERROR", "isActive debe ser boolean.");
  }

  if (payload.theme !== undefined) {
    if (typeof payload.theme !== "object" || payload.theme === null || Array.isArray(payload.theme)) {
      return badRequest(res, "VALIDATION_ERROR", "theme debe ser un objeto.");
    }

    const { primaryColor, secondaryColor, accentColor, fontFamilyHeading, fontFamilyBody } = payload.theme;

    for (const colorField of [primaryColor, secondaryColor, accentColor]) {
      if (colorField !== undefined) {
        const value = asTrimmedString(colorField);
        if (value && !HEX_COLOR_REGEX.test(value)) {
          return badRequest(res, "VALIDATION_ERROR", "Los colores del theme deben ser hex válidos.");
        }
      }
    }

    if (fontFamilyHeading !== undefined && asTrimmedString(fontFamilyHeading).length > 80) {
      return badRequest(res, "VALIDATION_ERROR", "fontFamilyHeading excede 80 caracteres.");
    }
    if (fontFamilyBody !== undefined && asTrimmedString(fontFamilyBody).length > 80) {
      return badRequest(res, "VALIDATION_ERROR", "fontFamilyBody excede 80 caracteres.");
    }
  }

  if (payload.homeBlocks !== undefined) {
    if (!Array.isArray(payload.homeBlocks)) {
      return badRequest(res, "VALIDATION_ERROR", "homeBlocks debe ser un arreglo.");
    }

    const allowedBlockTypes = new Set(["hero", "featured_products", "banners", "rich_text"]);
    for (const [index, block] of payload.homeBlocks.entries()) {
      if (!block || typeof block !== "object" || Array.isArray(block)) {
        return badRequest(res, "VALIDATION_ERROR", `homeBlocks[${index}] debe ser un objeto.`);
      }
      const type = asTrimmedString(block.type);
      if (!allowedBlockTypes.has(type)) {
        return badRequest(res, "VALIDATION_ERROR", `homeBlocks[${index}].type no es válido.`);
      }
      if (block.title !== undefined && asTrimmedString(block.title).length > 120) {
        return badRequest(res, "VALIDATION_ERROR", `homeBlocks[${index}].title excede 120 caracteres.`);
      }
      if (block.sortOrder !== undefined && (!Number.isInteger(block.sortOrder) || block.sortOrder < 0)) {
        return badRequest(res, "VALIDATION_ERROR", `homeBlocks[${index}].sortOrder debe ser entero >= 0.`);
      }
    }
  }

  return next();
};

const asFiniteNumber = (value) => {
  const num = typeof value === "string" ? Number(value.trim()) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : null;
};

const asValidDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validateAgencyClientPayload = (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";

  if (isCreate || payload.businessName !== undefined) {
    const businessName = asTrimmedString(payload.businessName);
    if (!businessName || businessName.length < 2 || businessName.length > 150) {
      return badRequest(res, "VALIDATION_ERROR", "businessName debe tener entre 2 y 150 caracteres.");
    }
    req.body.businessName = businessName;
  }

  if (payload.contactName !== undefined) {
    const contactName = asTrimmedString(payload.contactName);
    if (contactName.length > 120) {
      return badRequest(res, "VALIDATION_ERROR", "contactName excede 120 caracteres.");
    }
    req.body.contactName = contactName;
  }

  if (payload.contactEmail !== undefined) {
    const contactEmail = asTrimmedString(payload.contactEmail).toLowerCase();
    if (contactEmail && !validateEmail(contactEmail)) {
      return badRequest(res, "VALIDATION_ERROR", "contactEmail no es válido.");
    }
    req.body.contactEmail = contactEmail;
  }

  if (payload.contactPhone !== undefined) {
    const contactPhone = asTrimmedString(payload.contactPhone);
    if (contactPhone.length > 30) {
      return badRequest(res, "VALIDATION_ERROR", "contactPhone excede 30 caracteres.");
    }
    req.body.contactPhone = contactPhone;
  }

  if (payload.siteUrl !== undefined) {
    const siteUrl = asTrimmedString(payload.siteUrl);
    if (siteUrl.length > 300) {
      return badRequest(res, "VALIDATION_ERROR", "siteUrl excede 300 caracteres.");
    }
    req.body.siteUrl = siteUrl;
  }

  if (payload.hostingPlan !== undefined) {
    const hostingPlan = asTrimmedString(payload.hostingPlan).toLowerCase();
    if (hostingPlan && !HOSTING_PLAN_IDS.includes(hostingPlan)) {
      return badRequest(res, "VALIDATION_ERROR", `hostingPlan debe ser uno de: ${HOSTING_PLAN_IDS.join(", ")}.`);
    }
    req.body.hostingPlan = hostingPlan || undefined;
  }

  // El plan "vigente" para esta operación: lo que venga en el payload, o si no
  // se está tocando, el que ya tenía el cliente (req.agencyClient, disponible
  // en PUT porque ensureAgencyClientExists corre antes que este middleware).
  const effectivePlan = payload.hostingPlan !== undefined ? req.body.hostingPlan : req.agencyClient?.hostingPlan;

  if (effectivePlan && effectivePlan !== "enterprise") {
    // Precio fijo de lista: se deriva siempre server-side, ignorando lo que
    // mande el cliente, para que nunca se desincronice del precio real.
    req.body.hostingMonthlyCost = HOSTING_PLANS[effectivePlan].price;
  } else if (effectivePlan === "enterprise") {
    const rawCost = payload.hostingMonthlyCost !== undefined ? payload.hostingMonthlyCost : req.agencyClient?.hostingMonthlyCost;
    const cost = asFiniteNumber(rawCost);
    if (cost === null || cost <= 0) {
      return badRequest(res, "VALIDATION_ERROR", "hostingMonthlyCost es requerido (> 0) cuando hostingPlan es 'enterprise'.");
    }
    req.body.hostingMonthlyCost = cost;
  } else if (payload.hostingMonthlyCost !== undefined && payload.hostingMonthlyCost !== "" && payload.hostingMonthlyCost !== null) {
    // Sin plan definido, no debería mandarse un costo suelto (se ignora un
    // string vacío, ej. un input controlado sin tocar).
    return badRequest(res, "VALIDATION_ERROR", "hostingMonthlyCost solo aplica si se define hostingPlan.");
  } else if (payload.hostingMonthlyCost === "" || payload.hostingMonthlyCost === null) {
    // Normaliza el "vacío" a undefined para que Mongoose no intente castear
    // un string vacío a Number.
    req.body.hostingMonthlyCost = undefined;
  }

  if (payload.dockerContainers !== undefined) {
    if (!Array.isArray(payload.dockerContainers)) {
      return badRequest(res, "VALIDATION_ERROR", "dockerContainers debe ser un arreglo de nombres.");
    }
    const dockerContainers = payload.dockerContainers.map((name) => asTrimmedString(name)).filter(Boolean);
    if (dockerContainers.some((name) => name.length > 200)) {
      return badRequest(res, "VALIDATION_ERROR", "Cada nombre de contenedor excede 200 caracteres.");
    }
    req.body.dockerContainers = dockerContainers;
  }

  if (payload.domain !== undefined) {
    const domain = asTrimmedString(payload.domain).toLowerCase();
    if (domain.length > 200) {
      return badRequest(res, "VALIDATION_ERROR", "domain excede 200 caracteres.");
    }
    req.body.domain = domain;
  }

  if (payload.domainExpiresAt !== undefined) {
    if (payload.domainExpiresAt === "" || payload.domainExpiresAt === null) {
      req.body.domainExpiresAt = null;
    } else {
      const domainExpiresAt = asValidDate(payload.domainExpiresAt);
      if (!domainExpiresAt) {
        return badRequest(res, "VALIDATION_ERROR", "domainExpiresAt debe ser una fecha válida.");
      }
      req.body.domainExpiresAt = domainExpiresAt;
    }
  }

  if (payload.billingName !== undefined) {
    const billingName = asTrimmedString(payload.billingName);
    if (billingName.length > 200) {
      return badRequest(res, "VALIDATION_ERROR", "billingName excede 200 caracteres.");
    }
    req.body.billingName = billingName;
  }

  if (payload.billingRfc !== undefined) {
    const billingRfc = asTrimmedString(payload.billingRfc).toUpperCase();
    if (billingRfc.length > 20) {
      return badRequest(res, "VALIDATION_ERROR", "billingRfc excede 20 caracteres.");
    }
    req.body.billingRfc = billingRfc;
  }

  if (payload.billingAddress !== undefined) {
    const billingAddress = asTrimmedString(payload.billingAddress);
    if (billingAddress.length > 300) {
      return badRequest(res, "VALIDATION_ERROR", "billingAddress excede 300 caracteres.");
    }
    req.body.billingAddress = billingAddress;
  }

  if (payload.billingEmail !== undefined) {
    const billingEmail = asTrimmedString(payload.billingEmail).toLowerCase();
    if (billingEmail && !validateEmail(billingEmail)) {
      return badRequest(res, "VALIDATION_ERROR", "billingEmail no es válido.");
    }
    req.body.billingEmail = billingEmail;
  }

  if (payload.notes !== undefined) {
    const notes = asTrimmedString(payload.notes);
    if (notes.length > 2000) {
      return badRequest(res, "VALIDATION_ERROR", "notes excede 2000 caracteres.");
    }
    req.body.notes = notes;
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== "boolean") {
    return badRequest(res, "VALIDATION_ERROR", "isActive debe ser boolean.");
  }

  return next();
};

const validateHostingPaymentPayload = (req, res, next) => {
  const payload = req.body || {};

  const paidAt = asValidDate(payload.paidAt);
  if (!paidAt) return badRequest(res, "VALIDATION_ERROR", "paidAt es requerido y debe ser una fecha válida.");

  const coversUntil = asValidDate(payload.coversUntil);
  if (!coversUntil) {
    return badRequest(res, "VALIDATION_ERROR", "coversUntil es requerido y debe ser una fecha válida.");
  }

  if (coversUntil < paidAt) {
    return badRequest(res, "VALIDATION_ERROR", "coversUntil no puede ser anterior a paidAt.");
  }

  if (payload.amount !== undefined) {
    const amount = asFiniteNumber(payload.amount);
    if (amount === null || amount < 0) {
      return badRequest(res, "VALIDATION_ERROR", "amount debe ser un número >= 0.");
    }
    req.body.amount = amount;
  }

  if (payload.notes !== undefined) {
    const notes = asTrimmedString(payload.notes);
    if (notes.length > 500) {
      return badRequest(res, "VALIDATION_ERROR", "notes excede 500 caracteres.");
    }
    req.body.notes = notes;
  }

  req.body.paidAt = paidAt;
  req.body.coversUntil = coversUntil;
  return next();
};

const validateDesignDebtPayload = (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";

  // status se recalcula siempre server-side a partir de amount/amountPaid.
  delete req.body.status;

  let amount;
  if (isCreate || payload.amount !== undefined) {
    amount = asFiniteNumber(payload.amount);
    if (amount === null || amount <= 0) {
      return badRequest(res, "VALIDATION_ERROR", "amount es requerido y debe ser un número > 0.");
    }
    req.body.amount = amount;
  }

  if (isCreate || payload.description !== undefined) {
    const description = asTrimmedString(payload.description);
    if (!description || description.length > 300) {
      return badRequest(res, "VALIDATION_ERROR", "description es requerida (1-300 caracteres).");
    }
    req.body.description = description;
  }

  if (payload.amountPaid !== undefined) {
    const amountPaid = asFiniteNumber(payload.amountPaid);
    if (amountPaid === null || amountPaid < 0) {
      return badRequest(res, "VALIDATION_ERROR", "amountPaid debe ser un número >= 0.");
    }
    // Si amount no viene en este payload, la ruta valida contra el amount ya guardado.
    if (amount !== undefined && amountPaid > amount) {
      return badRequest(res, "VALIDATION_ERROR", "amountPaid no puede superar amount.");
    }
    req.body.amountPaid = amountPaid;
  }

  if (payload.invoicedAt !== undefined) {
    const invoicedAt = asValidDate(payload.invoicedAt);
    if (!invoicedAt) return badRequest(res, "VALIDATION_ERROR", "invoicedAt debe ser una fecha válida.");
    req.body.invoicedAt = invoicedAt;
  }

  if (payload.notes !== undefined) {
    const notes = asTrimmedString(payload.notes);
    if (notes.length > 500) {
      return badRequest(res, "VALIDATION_ERROR", "notes excede 500 caracteres.");
    }
    req.body.notes = notes;
  }

  return next();
};

const TRANSACTION_TYPES = ["income", "expense"];

const validateTransactionPayload = (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";

  if (isCreate || payload.type !== undefined) {
    const type = asTrimmedString(payload.type);
    if (!TRANSACTION_TYPES.includes(type)) {
      return badRequest(res, "VALIDATION_ERROR", `type debe ser uno de: ${TRANSACTION_TYPES.join(", ")}.`);
    }
    req.body.type = type;
  }

  if (isCreate || payload.amount !== undefined) {
    const amount = asFiniteNumber(payload.amount);
    if (amount === null || amount <= 0) {
      return badRequest(res, "VALIDATION_ERROR", "amount es requerido y debe ser un número > 0.");
    }
    req.body.amount = amount;
  }

  if (payload.date !== undefined) {
    const date = asValidDate(payload.date);
    if (!date) return badRequest(res, "VALIDATION_ERROR", "date debe ser una fecha válida.");
    req.body.date = date;
  }

  if (payload.category !== undefined) {
    const category = asTrimmedString(payload.category);
    if (category.length > 80) return badRequest(res, "VALIDATION_ERROR", "category excede 80 caracteres.");
    req.body.category = category;
  }

  if (payload.description !== undefined) {
    const description = asTrimmedString(payload.description);
    if (description.length > 500) return badRequest(res, "VALIDATION_ERROR", "description excede 500 caracteres.");
    req.body.description = description;
  }

  if (payload.client !== undefined) {
    if (payload.client === "" || payload.client === null) {
      req.body.client = null;
    } else if (!mongoose.Types.ObjectId.isValid(payload.client)) {
      return badRequest(res, "VALIDATION_ERROR", "client no es un id válido.");
    }
  }

  // source/sourceCollection/sourceId nunca se aceptan del cliente: los ponen
  // las rutas que generan transacciones automáticas (pagos de hosting, abonos
  // a deuda de diseño). Una transacción creada por esta validación siempre
  // queda como "manual".
  delete req.body.source;
  delete req.body.sourceCollection;
  delete req.body.sourceId;

  return next();
};

const validateOpeningBalancePayload = (req, res, next) => {
  const payload = req.body || {};
  const amount = asFiniteNumber(payload.amount);
  if (amount === null || amount < 0) {
    return badRequest(res, "VALIDATION_ERROR", "amount es requerido y debe ser un número >= 0.");
  }
  req.body.amount = amount;

  if (payload.date !== undefined) {
    const date = asValidDate(payload.date);
    if (!date) return badRequest(res, "VALIDATION_ERROR", "date debe ser una fecha válida.");
    req.body.date = date;
  }

  return next();
};

const validateInvoicePayload = (req, res, next) => {
  const payload = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(payload.client)) {
    return badRequest(res, "VALIDATION_ERROR", "client es requerido y debe ser un id válido.");
  }

  const concept = asTrimmedString(payload.concept);
  if (!concept || concept.length > 300) {
    return badRequest(res, "VALIDATION_ERROR", "concept es requerido (1-300 caracteres).");
  }
  req.body.concept = concept;

  const amount = asFiniteNumber(payload.amount);
  if (amount === null || amount <= 0) {
    return badRequest(res, "VALIDATION_ERROR", "amount es requerido y debe ser un número > 0.");
  }
  req.body.amount = amount;

  if (payload.issuedAt !== undefined) {
    const issuedAt = asValidDate(payload.issuedAt);
    if (!issuedAt) return badRequest(res, "VALIDATION_ERROR", "issuedAt debe ser una fecha válida.");
    req.body.issuedAt = issuedAt;
  }

  // Una factura creada por esta validación siempre es "manual" — las
  // automáticas las crean las rutas de pagos/deudas directamente.
  delete req.body.source;
  delete req.body.sourceCollection;
  delete req.body.sourceId;

  return next();
};

module.exports = {
  validateObjectIdParam,
  validateRegisterPayload,
  validateLoginPayload,
  validateUpdateUserPayload,
  validatePasswordChangePayload,
  validateContactEmailPayload,
  validateStoreConfigPayload,
  validateAgencyClientPayload,
  validateHostingPaymentPayload,
  validateDesignDebtPayload,
  validateTransactionPayload,
  validateOpeningBalancePayload,
  validateInvoicePayload,
};
