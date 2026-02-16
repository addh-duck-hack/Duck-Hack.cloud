const mongoose = require("mongoose");
const { isValidRole } = require("./authMiddleware");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

const validateEmail = (email) => EMAIL_REGEX.test(asTrimmedString(email));

const badRequest = (res, message) => res.status(400).json({ message });

const validateObjectIdParam = (paramName) => (req, res, next) => {
  const value = req.params?.[paramName];
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return badRequest(res, `${paramName} no válido`);
  }
  return next();
};

const validateRegisterPayload = (req, res, next) => {
  const name = asTrimmedString(req.body?.name);
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const password = asTrimmedString(req.body?.password);

  if (!name) return badRequest(res, "El nombre es requerido.");
  if (name.length < 2 || name.length > 80) {
    return badRequest(res, "El nombre debe tener entre 2 y 80 caracteres.");
  }

  if (!email) return badRequest(res, "El correo electrónico es requerido.");
  if (!validateEmail(email)) return badRequest(res, "El correo electrónico no es válido.");

  if (!password) return badRequest(res, "La contraseña es requerida.");
  if (password.length < 6) {
    return badRequest(res, "La contraseña debe tener al menos 6 caracteres.");
  }

  req.body.name = name;
  req.body.email = email;
  req.body.password = password;
  return next();
};

const validateLoginPayload = (req, res, next) => {
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const password = asTrimmedString(req.body?.password);

  if (!email) return badRequest(res, "El correo electrónico es requerido.");
  if (!validateEmail(email)) return badRequest(res, "El correo electrónico no es válido.");
  if (!password) return badRequest(res, "La contraseña es requerida.");

  req.body.email = email;
  req.body.password = password;
  return next();
};

const validateUpdateUserPayload = (req, res, next) => {
  const { name, email, role } = req.body || {};

  if (email !== undefined) {
    return badRequest(res, "El correo electrónico no puede modificarse.");
  }

  if (name !== undefined) {
    const normalizedName = asTrimmedString(name);
    if (!normalizedName) return badRequest(res, "El nombre no puede estar vacío.");
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      return badRequest(res, "El nombre debe tener entre 2 y 80 caracteres.");
    }
    req.body.name = normalizedName;
  }

  if (role !== undefined) {
    const normalizedRole = asTrimmedString(role);
    if (!isValidRole(normalizedRole)) {
      return badRequest(res, "Rol no válido");
    }
    req.body.role = normalizedRole;
  }

  return next();
};

const validatePasswordChangePayload = (req, res, next) => {
  const currentPassword = asTrimmedString(req.body?.currentPassword);
  const newPassword = asTrimmedString(req.body?.newPassword);

  if (!currentPassword || !newPassword) {
    return badRequest(res, "currentPassword y newPassword son requeridos.");
  }

  if (newPassword.length < 6) {
    return badRequest(res, "La nueva contraseña debe tener al menos 6 caracteres.");
  }

  if (currentPassword === newPassword) {
    return badRequest(res, "La nueva contraseña debe ser diferente a la contraseña actual.");
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

  if (!fullName) return badRequest(res, "El nombre completo es requerido.");
  if (fullName.length < 2 || fullName.length > 100) {
    return badRequest(res, "El nombre completo debe tener entre 2 y 100 caracteres.");
  }

  if (!email) return badRequest(res, "El correo electrónico es requerido.");
  if (!validateEmail(email)) return badRequest(res, "El correo electrónico no es válido.");

  if (!service) return badRequest(res, "El servicio es requerido.");
  if (service.length > 120) return badRequest(res, "El servicio es demasiado largo.");

  if (!message) return badRequest(res, "El mensaje es requerido.");
  if (message.length < 10 || message.length > 2000) {
    return badRequest(res, "El mensaje debe tener entre 10 y 2000 caracteres.");
  }

  if (phone && phone.length > 30) {
    return badRequest(res, "El teléfono es demasiado largo.");
  }

  req.body.fullName = fullName;
  req.body.email = email;
  req.body.phone = phone;
  req.body.service = service;
  req.body.message = message;
  return next();
};

module.exports = {
  validateObjectIdParam,
  validateRegisterPayload,
  validateLoginPayload,
  validateUpdateUserPayload,
  validatePasswordChangePayload,
  validateContactEmailPayload,
};
