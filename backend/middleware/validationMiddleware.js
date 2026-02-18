const mongoose = require("mongoose");
const { isValidRole } = require("./authMiddleware");
const { sendError } = require("../utils/httpResponses");

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

module.exports = {
  validateObjectIdParam,
  validateRegisterPayload,
  validateLoginPayload,
  validateUpdateUserPayload,
  validatePasswordChangePayload,
  validateContactEmailPayload,
  validateStoreConfigPayload,
};
