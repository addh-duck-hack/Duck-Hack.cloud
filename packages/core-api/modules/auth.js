// Auth/Usuarios. Copia fiel de backend/models/user.model.js +
// backend/routes/user.routes.js (ambos ahora eliminados) — mismos 8
// endpoints bajo /api/users, mismo comportamiento, mismos códigos de error.
// Además de `{name, registerRoutes, models}` (la convención de módulo, ver
// README.md), este módulo exporta `auth`: verifyToken/authorizeRoles/etc. —
// el resto de backend/ (AgencyClient, Accounting, Invoices, Infra) y los
// demás módulos de este paquete (vía ctx, vea packages/core-api/index.js)
// dependen de este export para RBAC, ya no de backend/middleware/authMiddleware.js.
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const {
  asTrimmedString,
  isValidObjectId,
  getOrCreateModel,
} = require("../lib/moduleHelpers");
const { createAuthMiddleware, isValidRole, ROLES, STAFF_ROLES } = require("../lib/authMiddleware");
const {
  validateJwtEnvConfig,
  signAccessToken,
  signEmailVerificationToken,
  verifyEmailVerificationToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
} = require("../lib/jwt");
const { createRateLimiter } = require("../lib/rateLimit");
const { createModuleAuthorizer, roleRank } = require("../lib/permissions");
const {
  REFRESH_REUSE_GRACE_MS,
  readRefreshTtlMs,
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
} = require("../lib/refreshTokens");
const { createSingleImageUploadMiddlewares } = require("../lib/uploads");
const { sendMail } = require("../lib/mailer");
const { verificationEmailTemplate, passwordResetEmailTemplate } = require("../lib/emailTemplates");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validateEmail = (email) => EMAIL_REGEX.test(asTrimmedString(email));

// Campos de una dirección de la libreta (User.addresses) — mismo set que
// Order.shippingAddress en modules/orders.js, para que una dirección
// guardada se pueda copiar tal cual al pedido en el checkout (ver Cart.jsx
// en frontend-user). `interiorNumber` es el único opcional del bloque de
// domicilio; `label`/`isDefault` se manejan aparte (no son parte de "la
// dirección" en sí).
const ADDRESS_REQUIRED_FIELDS = [
  "recipientName",
  "phone",
  "street",
  "exteriorNumber",
  "zipCode",
  "neighborhood",
  "city",
  "state",
];
const ADDRESS_FIELDS = [...ADDRESS_REQUIRED_FIELDS, "interiorNumber"];

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.CUSTOMER,
  },
  // Opcional a propósito — ni /register (autoservicio) ni el alta de staff
  // desde el panel (POST /) lo exigen. Sin validación de formato (mismo
  // criterio que Order.customerPhone en modules/orders.js): los números
  // vienen en formatos muy distintos según el país, un regex fijo rechazaría
  // casos válidos.
  phone: {
    type: String,
    trim: true,
    maxlength: 40,
  },
  // Libreta de direcciones ("Mi cuenta > Direcciones" en frontend-user) — se
  // gestiona con POST/PUT/DELETE /:id/addresses[/:addressId], nunca con
  // PUT /:id (igual que favorites, ver validateUpdateUserPayload). Cada
  // dirección es texto libre, mismo criterio que Order.shippingAddress en
  // modules/orders.js. `isDefault` marca cuál se usa para precargar el
  // checkout (Cart.jsx en frontend-user) — las rutas de abajo garantizan que
  // como mucho una tenga isDefault:true a la vez.
  addresses: {
    type: [
      new mongoose.Schema(
        {
          label: { type: String, trim: true, maxlength: 60 },
          recipientName: { type: String, required: true, trim: true, maxlength: 200 },
          phone: { type: String, required: true, trim: true, maxlength: 40 },
          street: { type: String, required: true, trim: true, maxlength: 200 },
          exteriorNumber: { type: String, required: true, trim: true, maxlength: 20 },
          interiorNumber: { type: String, trim: true, maxlength: 20 },
          zipCode: { type: String, required: true, trim: true, maxlength: 10 },
          neighborhood: { type: String, required: true, trim: true, maxlength: 120 },
          city: { type: String, required: true, trim: true, maxlength: 120 },
          state: { type: String, required: true, trim: true, maxlength: 120 },
          isDefault: { type: Boolean, default: false },
        },
        { timestamps: true }
      ),
    ],
    default: [],
  },
  // Productos guardados para después — "Mi cuenta > Favoritos" en
  // frontend-user. Se gestiona con POST/DELETE /:id/favorites, nunca con
  // PUT /:id (ver validateUpdateUserPayload, que ni siquiera lo acepta).
  favorites: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    default: [],
  },
  profileImage: {
    type: String, // Almacena la ruta de la imagen subida
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Derecho ARCO de Cancelación (ver Aviso de Privacidad, frontend-user): el
  // documento NUNCA se borra físicamente (Order.customer lo referencia, ver
  // modules/orders.js) — en su lugar se anonimiza (ver DELETE /:id más abajo)
  // y se marca aquí. `null` = cuenta activa.
  deletedAt: {
    type: Date,
    default: null,
  },
});

userSchema.pre("save", async function (next) {
  const user = this;
  if (!user.isModified("password")) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Refresh tokens (sesión larga para la app móvil, ver lib/refreshTokens.js).
// Solo se guarda el hash; `family` agrupa las rotaciones de una misma sesión
// (un login = una familia). Mongo borra los vencidos solo (índice TTL).
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    // Rotado (sustituido por uno nuevo de la misma familia) — distinto de
    // revokedAt a secas (logout, cambio de contraseña, robo detectado).
    replacedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;
  const user = typeof userDoc.toObject === "function" ? userDoc.toObject() : { ...userDoc };
  delete user.password;
  return user;
};

// Huella del hash de contraseña actual para el token de restablecer (ver
// lib/jwt.js#signPasswordResetToken): cambia en cuanto cambia la contraseña,
// así un enlace ya usado (o uno viejo) deja de servir.
const passwordFingerprint = (passwordHash) =>
  crypto.createHash("sha256").update(String(passwordHash || "")).digest("hex").slice(0, 16);

const MIN_PASSWORD_LENGTH = 6;

// --- Validación (portada de backend/middleware/validationMiddleware.js) ---

const validateRegisterPayload = (sendError) => (req, res, next) => {
  const name = asTrimmedString(req.body?.name);
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const password = asTrimmedString(req.body?.password);

  if (!name) return sendError(res, 400, "VALIDATION_ERROR", "El nombre es requerido.");
  if (name.length < 2 || name.length > 80) {
    return sendError(res, 400, "VALIDATION_ERROR", "El nombre debe tener entre 2 y 80 caracteres.");
  }

  if (!email) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico es requerido.");
  if (!validateEmail(email)) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico no es válido.");

  if (!password) return sendError(res, 400, "VALIDATION_ERROR", "La contraseña es requerida.");
  if (password.length < 6) {
    return sendError(res, 400, "VALIDATION_ERROR", "La contraseña debe tener al menos 6 caracteres.");
  }

  // Opcional — sin formato fijo, ver comentario en el schema.
  if (req.body?.phone !== undefined) {
    req.body.phone = asTrimmedString(req.body.phone);
  }

  req.body.name = name;
  req.body.email = email;
  req.body.password = password;
  return next();
};

const validateLoginPayload = (sendError) => (req, res, next) => {
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const password = asTrimmedString(req.body?.password);

  if (!email) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico es requerido.");
  if (!validateEmail(email)) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico no es válido.");
  if (!password) return sendError(res, 400, "VALIDATION_ERROR", "La contraseña es requerida.");

  req.body.email = email;
  req.body.password = password;
  return next();
};

// Solo para POST / (alta de staff desde el panel, ver más abajo) — a
// diferencia de validateRegisterPayload (POST /register, autoservicio,
// siempre role: customer), aquí sí se acepta `role` porque quien crea la
// cuenta ya es staff autenticado, no el propio dueño de la cuenta.
const validateCreateStaffPayload = (sendError) => (req, res, next) => {
  const name = asTrimmedString(req.body?.name);
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const password = asTrimmedString(req.body?.password);
  const role = asTrimmedString(req.body?.role);

  if (!name) return sendError(res, 400, "VALIDATION_ERROR", "El nombre es requerido.");
  if (name.length < 2 || name.length > 80) {
    return sendError(res, 400, "VALIDATION_ERROR", "El nombre debe tener entre 2 y 80 caracteres.");
  }

  if (!email) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico es requerido.");
  if (!validateEmail(email)) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico no es válido.");

  if (!password) return sendError(res, 400, "VALIDATION_ERROR", "La contraseña es requerida.");
  if (password.length < 6) {
    return sendError(res, 400, "VALIDATION_ERROR", "La contraseña debe tener al menos 6 caracteres.");
  }

  if (!role || !isValidRole(role)) {
    return sendError(res, 400, "INVALID_ROLE", "Rol no válido");
  }

  // Opcional — sin formato fijo, ver comentario en el schema.
  if (req.body?.phone !== undefined) {
    req.body.phone = asTrimmedString(req.body.phone);
  }

  req.body.name = name;
  req.body.email = email;
  req.body.password = password;
  req.body.role = role;
  return next();
};

const validateUpdateUserPayload = (sendError) => (req, res, next) => {
  const { name, email, phone, role } = req.body || {};

  if (email !== undefined) {
    return sendError(res, 400, "EMAIL_CHANGE_NOT_ALLOWED", "El correo electrónico no puede modificarse.");
  }

  if (name !== undefined) {
    const normalizedName = asTrimmedString(name);
    if (!normalizedName) return sendError(res, 400, "VALIDATION_ERROR", "El nombre no puede estar vacío.");
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      return sendError(res, 400, "VALIDATION_ERROR", "El nombre debe tener entre 2 y 80 caracteres.");
    }
    req.body.name = normalizedName;
  }

  // Opcional — a diferencia de `name`, sí se puede mandar vacío para borrar
  // el teléfono guardado. Las direcciones NO se tocan aquí — ver
  // POST/PUT/DELETE /:id/addresses más abajo.
  if (phone !== undefined) {
    req.body.phone = asTrimmedString(phone);
  }

  if (role !== undefined) {
    const normalizedRole = asTrimmedString(role);
    if (!isValidRole(normalizedRole)) {
      return sendError(res, 400, "INVALID_ROLE", "Rol no válido");
    }
    req.body.role = normalizedRole;
  }

  return next();
};

const validatePasswordChangePayload = (sendError) => (req, res, next) => {
  const currentPassword = asTrimmedString(req.body?.currentPassword);
  const newPassword = asTrimmedString(req.body?.newPassword);

  if (!currentPassword || !newPassword) {
    return sendError(res, 400, "VALIDATION_ERROR", "currentPassword y newPassword son requeridos.");
  }

  if (newPassword.length < 6) {
    return sendError(res, 400, "VALIDATION_ERROR", "La nueva contraseña debe tener al menos 6 caracteres.");
  }

  if (currentPassword === newPassword) {
    return sendError(res, 400, "VALIDATION_ERROR", "La nueva contraseña debe ser diferente a la contraseña actual.");
  }

  req.body.currentPassword = currentPassword;
  req.body.newPassword = newPassword;
  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, sendError } = ctx;
  const User = getOrCreateModel(mongooseConnection, "User", userSchema);
  const RefreshToken = getOrCreateModel(mongooseConnection, "RefreshToken", refreshTokenSchema);
  const { verifyToken, authorizeSelf } = createAuthMiddleware(sendError);
  // Administrar usuarios es el módulo "users" de los permisos por tienda
  // (lib/permissions.js). Además, salvo super_admin, nadie ve, crea, edita ni
  // asigna una cuenta de rango mayor al suyo (roleRank) — así un collaborator
  // con Usuarios no puede tocar a un store_admin.
  const { authorizeModule, authorizeSelfOrModule } = createModuleAuthorizer({ mongooseConnection, sendError });
  const outranks = (actorRole, targetRole) => actorRole !== ROLES.SUPER_ADMIN && roleRank(targetRole) > roleRank(actorRole);

  const router = express.Router();

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) {
      return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    }
    return next();
  };

  const registerRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    code: "RATE_LIMIT_REGISTER_EXCEEDED",
    message: "Demasiados intentos de registro. Intenta nuevamente más tarde.",
    sendError,
  });
  // Reenvío de verificación y recuperación de contraseña: mandan correos, así
  // que el límite es más corto que el de login.
  const accountEmailRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    code: "RATE_LIMIT_ACCOUNT_EMAIL_EXCEEDED",
    message: "Demasiadas solicitudes. Espera unos minutos antes de intentar de nuevo.",
    sendError,
  });
  const resetPasswordRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    code: "RATE_LIMIT_RESET_PASSWORD_EXCEEDED",
    message: "Demasiados intentos. Espera unos minutos antes de intentar de nuevo.",
    sendError,
  });
  const loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    code: "RATE_LIMIT_LOGIN_EXCEEDED",
    message: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
    sendError,
  });
  // Más holgado que login: un cliente legítimo renueva solo cada vez que
  // vence el access token, pero muchos usuarios móviles comparten IP.
  const refreshRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 120,
    code: "RATE_LIMIT_REFRESH_EXCEEDED",
    message: "Demasiadas solicitudes de sesión. Intenta nuevamente más tarde.",
    sendError,
  });

  // --- Refresh tokens (ver lib/refreshTokens.js) ---

  const issueRefreshToken = async (userId, req, family = newFamilyId()) => {
    const token = generateRefreshToken();
    await RefreshToken.create({
      user: userId,
      tokenHash: hashRefreshToken(token),
      family,
      expiresAt: new Date(Date.now() + readRefreshTtlMs()),
      userAgent: asTrimmedString(req.get("User-Agent")).slice(0, 300) || undefined,
    });
    return token;
  };

  const revokeRefreshFamily = (family) =>
    RefreshToken.updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date() } });

  // Cierra todas las sesiones largas del usuario (cambio/restablecimiento de
  // contraseña, cuenta eliminada). `exceptFamily` conserva la sesión desde la
  // que se hizo el cambio, si el cliente mandó su refresh token.
  const revokeUserRefreshTokens = (userId, exceptFamily) =>
    RefreshToken.updateMany(
      { user: userId, revokedAt: null, ...(exceptFamily ? { family: { $ne: exceptFamily } } : {}) },
      { $set: { revokedAt: new Date() } }
    );

  // Familia de un refresh token vigente de `userId`, o null.
  const findActiveRefreshFamily = async (rawToken, userId) => {
    const token = asTrimmedString(rawToken);
    if (!token) return null;
    const doc = await RefreshToken.findOne({
      tokenHash: hashRefreshToken(token),
      user: userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).select("family");
    return doc?.family || null;
  };

  const { uploadMiddleware: uploadProfileImage, sanitizeAndStoreMiddleware: sanitizeProfileImageUpload } =
    createSingleImageUploadMiddlewares({
      fieldName: "profileImage",
      filePrefix: "profileImage",
      maxFileSizeMB: 5,
      sendError,
    });

  // Marca de la tienda para los correos de cuenta (nombre, logo absoluto vía
  // BACKEND_PUBLIC_URL y color de acento), igual que los correos de pedido.
  const loadEmailBranding = async () => {
    const StoreConfig = mongooseConnection.models.StoreConfig;
    const config = StoreConfig
      ? await StoreConfig.findOne({ singletonKey: "default" }).select("storeName logoUrl theme").lean()
      : null;
    const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
    return {
      storeName: config?.storeName || "Duck-Hack",
      logoUrl: backendPublicUrl && config?.logoUrl ? `${backendPublicUrl}/${String(config.logoUrl).replace(/^\/+/, "")}` : undefined,
      accent: config?.theme?.accentColor,
    };
  };

  // Los enlaces de los correos apuntan al storefront (FRONTEND_URL).
  const frontendUrl = (path) => `${(process.env.FRONTEND_URL || "").replace(/\/+$/, "")}${path}`;

  const sendVerificationEmail = async (user) => {
    const token = signEmailVerificationToken({ id: user._id });
    const branding = await loadEmailBranding();
    const { html, text } = verificationEmailTemplate({
      ...branding,
      name: user.name,
      verifyUrl: frontendUrl(`/users/verify?token=${token}`),
    });
    await sendMail({ to: user.email, subject: `Verifica tu cuenta - ${branding.storeName}`, html, text });
  };

  const sendPasswordResetEmail = async (user) => {
    const token = signPasswordResetToken({ id: user._id, fingerprint: passwordFingerprint(user.password) });
    const branding = await loadEmailBranding();
    const { html, text } = passwordResetEmailTemplate({
      ...branding,
      name: user.name,
      resetUrl: frontendUrl(`/restablecer-contrasena?token=${token}`),
      expiresIn: "1 hora",
    });
    await sendMail({ to: user.email, subject: `Restablece tu contraseña - ${branding.storeName}`, html, text });
  };

  // Correo solo (reenvío/recuperación): mismo formato que login.
  const validateEmailOnlyPayload = (req, res, next) => {
    const email = asTrimmedString(req.body?.email).toLowerCase();
    if (!email) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico es requerido.");
    if (!validateEmail(email)) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico no es válido.");
    req.body = { email };
    return next();
  };

  router.post("/register", registerRateLimiter, validateRegisterPayload(sendError), async (req, res) => {
    try {
      const { name, email, password, phone } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        return sendError(res, 409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado");
      }

      const user = new User({ name, email, password, phone, role: ROLES.CUSTOMER });
      await user.save();

      // No bloquea el flujo de registro si falla el envío (se puede pedir
      // otro con POST /resend-verification).
      sendVerificationEmail(user).catch((err) => {
        console.error("Error enviando correo de verificación:", err);
      });

      res.status(201).json({
        message: "Usuario registrado con éxito. Revisa tu correo para verificar la cuenta.",
        user: sanitizeUser(user),
      });
    } catch (error) {
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((e) => e.message).join(", ");
        return sendError(res, 400, "VALIDATION_ERROR", messages);
      }
      if (error.code === 11000) {
        return sendError(res, 409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado");
      }
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al registrar el usuario");
    }
  });

  router.get("/verify", async (req, res) => {
    const token = req.query.token;
    if (!token) {
      return sendError(res, 400, "VERIFICATION_TOKEN_REQUIRED", "Token de verificación requerido");
    }

    try {
      const decoded = verifyEmailVerificationToken(token);
      const user = await User.findById(decoded.id);
      if (!user) return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");

      if (user.isVerified) {
        return res.status(200).json({ message: "Usuario ya verificado" });
      }

      user.isVerified = true;
      await user.save();

      res.status(200).json({ message: "Usuario verificado correctamente" });
    } catch (err) {
      console.error("Error verificando token:", err);
      return sendError(res, 400, "VERIFICATION_TOKEN_INVALID_OR_EXPIRED", "Token inválido o expirado");
    }
  });

  // Reenviar el correo de verificación. Respuesta siempre igual (exista o no
  // la cuenta, o ya esté verificada) para no revelar qué correos están
  // registrados; solo se manda si hay una cuenta pendiente de verificar.
  router.post("/resend-verification", accountEmailRateLimiter, validateEmailOnlyPayload, async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email, deletedAt: null });
      if (user && !user.isVerified) {
        await sendVerificationEmail(user);
      }
      return res.status(200).json({
        message: "Si hay una cuenta pendiente de verificar con ese correo, te enviamos un nuevo enlace.",
      });
    } catch (error) {
      console.error("Error reenviando verificación:", error);
      return sendError(res, 500, "EMAIL_SEND_FAILED", "No fue posible enviar el correo. Intenta más tarde.");
    }
  });

  // Recuperar contraseña: manda un enlace de un solo uso al storefront
  // (/restablecer-contrasena?token=). Misma respuesta genérica que el reenvío.
  router.post("/forgot-password", accountEmailRateLimiter, validateEmailOnlyPayload, async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email, deletedAt: null });
      if (user) {
        await sendPasswordResetEmail(user);
      }
      return res.status(200).json({
        message: "Si hay una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.",
      });
    } catch (error) {
      console.error("Error enviando recuperación de contraseña:", error);
      return sendError(res, 500, "EMAIL_SEND_FAILED", "No fue posible enviar el correo. Intenta más tarde.");
    }
  });

  // Restablecer la contraseña con el token del correo. El token deja de
  // servir en cuanto la contraseña cambia (huella, ver passwordFingerprint).
  // Restablecer también verifica la cuenta: el enlace llegó a su correo.
  router.post("/reset-password", resetPasswordRateLimiter, async (req, res) => {
    const token = asTrimmedString(req.body?.token);
    const password = asTrimmedString(req.body?.password);
    if (!token) return sendError(res, 400, "RESET_TOKEN_REQUIRED", "Falta el token para restablecer la contraseña.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return sendError(res, 400, "VALIDATION_ERROR", `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    let decoded;
    try {
      decoded = verifyPasswordResetToken(token);
    } catch {
      return sendError(res, 400, "RESET_TOKEN_INVALID_OR_EXPIRED", "El enlace no es válido o ya venció. Pide uno nuevo.");
    }

    try {
      const user = await User.findOne({ _id: decoded.id, deletedAt: null });
      if (!user || decoded.pwf !== passwordFingerprint(user.password)) {
        return sendError(res, 400, "RESET_TOKEN_INVALID_OR_EXPIRED", "El enlace no es válido o ya venció. Pide uno nuevo.");
      }
      user.password = password; // pre("save") la hashea
      user.isVerified = true;
      await user.save();
      await revokeUserRefreshTokens(user._id);
      return res.status(200).json({ message: "Tu contraseña se actualizó. Ya puedes iniciar sesión." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "No fue posible actualizar la contraseña.");
    }
  });

  router.put(
    "/:id",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeSelfOrModule("id", "users"),
    uploadProfileImage,
    sanitizeProfileImageUpload,
    validateUpdateUserPayload(sendError),
    async (req, res) => {
      try {
        const userId = req.params.id;
        const actorRole = req.user.role;
        const actorId = String(req.user.id);

        const { name, phone, role } = req.body;

        const updateData = {};
        if (name !== undefined) {
          updateData.name = name;
        }
        if (phone !== undefined) {
          updateData.phone = phone;
        }

        if (req.savedImagePath) {
          updateData.profileImage = req.savedImagePath;
        }

        if (Object.keys(updateData).length === 0 && role === undefined) {
          return sendError(res, 400, "NO_UPDATE_FIELDS", "No se enviaron datos para actualizar.");
        }

        const currentUser = await User.findById(userId).select("role");
        if (!currentUser) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        if (outranks(actorRole, currentUser.role)) {
          return sendError(res, 403, "FORBIDDEN_EDIT_USER", "No tienes permisos para editar este usuario.");
        }

        const isSelfUpdate = actorId === String(currentUser._id);
        if (role !== undefined) {
          if (!isValidRole(role)) {
            return sendError(res, 400, "INVALID_ROLE", "Rol no válido");
          }

          if (actorRole === ROLES.CUSTOMER) {
            return sendError(res, 403, "FORBIDDEN_CHANGE_ROLE", "No tienes permisos para cambiar roles.");
          }

          if (isSelfUpdate) {
            return sendError(res, 400, "CANNOT_CHANGE_OWN_ROLE", "No puedes cambiar tu propio rol.");
          }

          if (outranks(actorRole, role)) {
            return sendError(res, 403, "FORBIDDEN_ASSIGN_ROLE", "No tienes permisos para asignar este rol.");
          }

          updateData.role = role;
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

        if (!updatedUser) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        res.status(200).json({ message: "Usuario actualizado correctamente", user: sanitizeUser(updatedUser) });
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al actualizar el usuario");
      }
    }
  );

  router.patch(
    "/:id/password",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeSelf("id"),
    validatePasswordChangePayload(sendError),
    async (req, res) => {
      try {
        const userId = req.params.id;
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(userId);
        if (!user) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
          return sendError(res, 400, "INVALID_CURRENT_PASSWORD", "La contraseña actual no es correcta.");
        }

        // Opcional: el refresh token de la sesión actual, para no cerrarla
        // junto con las demás.
        const currentFamily = await findActiveRefreshFamily(req.body.refreshToken, user._id);

        user.password = newPassword;
        await user.save();
        await revokeUserRefreshTokens(user._id, currentFamily);

        return res.status(200).json({ message: "Contraseña actualizada correctamente." });
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al actualizar contraseña");
      }
    }
  );

  // Favoritos — solo el dueño de la cuenta los administra (ni siquiera
  // super_admin/store_admin, a diferencia de PUT/DELETE /:id), y solo se
  // exponen name/price/images/category del producto vía el populate de
  // GET /:id de arriba, nunca se editan por PUT /:id.
  router.post(
    "/:id/favorites",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeSelf("id"),
    async (req, res) => {
      try {
        const { productId } = req.body || {};
        if (!isValidObjectId(productId)) {
          return sendError(res, 400, "VALIDATION_ERROR", "productId debe ser un id válido.");
        }

        const Product = mongooseConnection.models.Product;
        const product = Product && (await Product.findById(productId).select("_id"));
        if (!product) {
          return sendError(res, 404, "PRODUCT_NOT_FOUND", "El producto no existe.");
        }

        // $addToSet: idempotente — agregar el mismo producto dos veces no
        // duplica la entrada.
        const user = await User.findByIdAndUpdate(
          req.params.id,
          { $addToSet: { favorites: productId } },
          { new: true }
        ).populate("favorites", "name price images category");
        if (!user) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        res.status(200).json({ message: "Agregado a favoritos.", user: sanitizeUser(user) });
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al agregar a favoritos");
      }
    }
  );

  router.delete(
    "/:id/favorites/:productId",
    validateObjectIdParam("id"),
    validateObjectIdParam("productId"),
    verifyToken,
    authorizeSelf("id"),
    async (req, res) => {
      try {
        const user = await User.findByIdAndUpdate(
          req.params.id,
          { $pull: { favorites: req.params.productId } },
          { new: true }
        ).populate("favorites", "name price images category");
        if (!user) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        res.status(200).json({ message: "Quitado de favoritos.", user: sanitizeUser(user) });
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al quitar de favoritos");
      }
    }
  );

  // Direcciones — igual que favoritos, solo el dueño de la cuenta las
  // administra. `isDefault` es la que usa Cart.jsx (frontend-user) para
  // precargar el checkout; como mucho una queda con isDefault:true a la vez
  // — marcar una nueva como default le quita la marca a las demás.
  router.post(
    "/:id/addresses",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeSelf("id"),
    async (req, res) => {
      try {
        const label = asTrimmedString(req.body?.label);
        const fields = {};
        for (const field of ADDRESS_FIELDS) {
          fields[field] = asTrimmedString(req.body?.[field]);
        }
        const missing = ADDRESS_REQUIRED_FIELDS.filter((field) => !fields[field]);
        if (missing.length > 0) {
          return sendError(res, 400, "VALIDATION_ERROR", `Faltan campos requeridos: ${missing.join(", ")}.`);
        }

        const user = await User.findById(req.params.id);
        if (!user) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        // La primera dirección siempre queda como default aunque no se pida
        // explícito — si no, "Mi cuenta" tendría una sola dirección guardada
        // y ninguna para precargar el checkout.
        const makeDefault = Boolean(req.body?.isDefault) || user.addresses.length === 0;
        if (makeDefault) {
          user.addresses.forEach((a) => {
            a.isDefault = false;
          });
        }
        user.addresses.push({ label, ...fields, isDefault: makeDefault });
        await user.save();

        res.status(201).json({ message: "Dirección agregada.", user: sanitizeUser(user) });
      } catch (error) {
        if (error.name === "ValidationError") {
          const messages = Object.values(error.errors).map((e) => e.message).join(", ");
          return sendError(res, 400, "VALIDATION_ERROR", messages);
        }
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al agregar la dirección");
      }
    }
  );

  router.put(
    "/:id/addresses/:addressId",
    validateObjectIdParam("id"),
    validateObjectIdParam("addressId"),
    verifyToken,
    authorizeSelf("id"),
    async (req, res) => {
      try {
        const user = await User.findById(req.params.id);
        if (!user) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        const target = user.addresses.id(req.params.addressId);
        if (!target) {
          return sendError(res, 404, "ADDRESS_NOT_FOUND", "Dirección no encontrada.");
        }

        if (req.body?.label !== undefined) {
          target.label = asTrimmedString(req.body.label);
        }
        for (const field of ADDRESS_FIELDS) {
          if (req.body?.[field] === undefined) continue;
          const normalized = asTrimmedString(req.body[field]);
          if (ADDRESS_REQUIRED_FIELDS.includes(field) && !normalized) {
            return sendError(res, 400, "VALIDATION_ERROR", `${field} no puede quedar vacío.`);
          }
          target[field] = normalized;
        }
        if (req.body?.isDefault !== undefined) {
          if (req.body.isDefault) {
            user.addresses.forEach((a) => {
              a.isDefault = String(a._id) === String(target._id);
            });
          } else {
            target.isDefault = false;
          }
        }

        await user.save();
        res.status(200).json({ message: "Dirección actualizada.", user: sanitizeUser(user) });
      } catch (error) {
        if (error.name === "ValidationError") {
          const messages = Object.values(error.errors).map((e) => e.message).join(", ");
          return sendError(res, 400, "VALIDATION_ERROR", messages);
        }
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al actualizar la dirección");
      }
    }
  );

  router.delete(
    "/:id/addresses/:addressId",
    validateObjectIdParam("id"),
    validateObjectIdParam("addressId"),
    verifyToken,
    authorizeSelf("id"),
    async (req, res) => {
      try {
        const user = await User.findById(req.params.id);
        if (!user) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        const target = user.addresses.id(req.params.addressId);
        if (!target) {
          return sendError(res, 404, "ADDRESS_NOT_FOUND", "Dirección no encontrada.");
        }

        const wasDefault = target.isDefault;
        target.deleteOne();
        // Si borré la default y quedan otras, la primera que quede pasa a
        // default — para que siempre haya una precargando el checkout.
        if (wasDefault && user.addresses.length > 0) {
          user.addresses[0].isDefault = true;
        }
        await user.save();

        res.status(200).json({ message: "Dirección eliminada.", user: sanitizeUser(user) });
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar la dirección");
      }
    }
  );

  // Alta de staff desde el panel (mismo criterio que POST / en
  // packages/core-api/modules/orders.js: la versión "staff, autenticado" de
  // un POST /register público). A diferencia de /register, la cuenta entra
  // ya verificada (isVerified: true) porque quien la crea es un admin que le
  // entrega la contraseña directo a la persona, no ella registrándose sola —
  // no hace falta correo de verificación de por medio.
  router.post(
    "/",
    verifyToken,
    authorizeModule("users"),
    validateCreateStaffPayload(sendError),
    async (req, res) => {
      try {
        const { name, email, password, role, phone } = req.body;
        const actorRole = req.user.role;

        // Mismo límite que en PUT /:id: nadie crea cuentas de rango mayor al suyo.
        if (outranks(actorRole, role)) {
          return sendError(res, 403, "FORBIDDEN_ASSIGN_ROLE", "No tienes permisos para asignar este rol.");
        }

        const existing = await User.findOne({ email });
        if (existing) {
          return sendError(res, 409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado");
        }

        const user = new User({ name, email, password, role, phone, isVerified: true });
        await user.save();

        res.status(201).json({ message: "Usuario creado correctamente.", user: sanitizeUser(user) });
      } catch (error) {
        if (error.name === "ValidationError") {
          const messages = Object.values(error.errors).map((e) => e.message).join(", ");
          return sendError(res, 400, "VALIDATION_ERROR", messages);
        }
        if (error.code === 11000) {
          return sendError(res, 409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado");
        }
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al crear el usuario");
      }
    }
  );

  router.get("/", verifyToken, authorizeModule("users"), async (req, res) => {
    try {
      // Sin las cuentas de rango mayor al de quien consulta (ej. store_admin no ve super_admin).
      const visibleRoles = Object.values(ROLES).filter((role) => !outranks(req.user.role, role));
      const users = await User.find({ deletedAt: null, role: { $in: visibleRoles } }).select(
        "_id name email phone role isVerified createdAt"
      );
      res.json(users);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener usuarios");
    }
  });

  router.get(
    "/:id",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeSelfOrModule("id", "users"),
    async (req, res) => {
      try {
        const userId = req.params.id;
        const actorRole = req.user.role;

        // populate solo lo necesario para pintar una tarjeta en "Mi cuenta >
        // Favoritos" sin una segunda llamada — Product no trae nada sensible.
        const user = await User.findById(userId).populate("favorites", "name price images category");

        if (!user) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        if (outranks(actorRole, user.role)) {
          return sendError(res, 403, "FORBIDDEN_VIEW_USER", "No tienes permisos para consultar este usuario.");
        }

        res.status(200).json(sanitizeUser(user));
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar usuario");
      }
    }
  );

  router.post("/login", loginRateLimiter, validateLoginPayload(sendError), async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return sendError(res, 401, "INVALID_CREDENTIALS", "Error al iniciar sesión. Verifica tus credenciales.");
      }

      if (!user.isVerified) {
        return sendError(res, 403, "ACCOUNT_NOT_VERIFIED", "Cuenta no verificada. Revisa tu correo para activar la cuenta.");
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return sendError(res, 401, "INVALID_CREDENTIALS", "Error al iniciar sesión. Verifica tus credenciales.");
      }

      if (!isValidRole(user.role)) {
        return sendError(res, 403, "ROLE_NOT_SUPPORTED", "La cuenta tiene un rol no soportado por el sistema.");
      }

      const token = signAccessToken({ id: user._id, role: user.role });
      const refreshToken = await issueRefreshToken(user._id, req);

      const userResponse = {
        ...sanitizeUser(user),
        role: user.role,
      };
      res.status(200).json({ message: "Inicio de sesión exitoso", token, refreshToken, user: userResponse });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al iniciar sesión");
    }
  });

  // Derecho ARCO de Cancelación: un customer puede ejercerlo sobre su PROPIA
  // cuenta (autoservicio, ver MiCuenta.jsx en frontend-user), y staff
  // (store_admin/super_admin) puede ejercerlo sobre la cuenta de OTRO
  // usuario (panel admin) — nunca sobre la suya propia, para no bloquearse
  // a sí mismos. No es un hard-delete: el documento se conserva (Order.customer
  // lo referencia, ver modules/orders.js — Order ya guarda su propia copia de
  // customerName/customerEmail/customerPhone, así que el historial de pedidos
  // no pierde nada) pero se anonimiza por completo y se marca con `deletedAt`.
  router.delete(
    "/:id",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeSelfOrModule("id", "users"),
    async (req, res) => {
      try {
        const userId = req.params.id;
        const actorRole = req.user.role;
        const actorId = String(req.user.id);
        const isSelf = actorId === userId;

        const userToDelete = await User.findById(userId);
        if (!userToDelete) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        if (userToDelete.deletedAt) {
          return sendError(res, 400, "USER_ALREADY_DELETED", "Esta cuenta ya fue eliminada.");
        }

        if (outranks(actorRole, userToDelete.role)) {
          return sendError(res, 403, "FORBIDDEN_DELETE_USER", "No tienes permisos para eliminar este usuario.");
        }

        // Staff no puede auto-eliminarse (evita que un admin se bloquee a sí
        // mismo); un customer sí, es exactamente el caso de autoservicio.
        if (isSelf && actorRole !== ROLES.CUSTOMER) {
          return sendError(res, 400, "CANNOT_DELETE_OWN_ACCOUNT", "No puedes eliminar tu propia cuenta.");
        }

        userToDelete.name = "Cuenta eliminada";
        userToDelete.phone = undefined;
        userToDelete.addresses = [];
        userToDelete.favorites = [];
        userToDelete.profileImage = undefined;
        // Único a propósito: el correo original queda disponible de nuevo
        // para un registro futuro, y ".delete" nunca choca con el índice
        // único de `email` entre distintas cuentas eliminadas.
        userToDelete.email = `${userToDelete.email}.delete`;
        // Password aleatoria (nunca queda en texto plano, el hook
        // pre("save") la hashea igual que en el cambio de contraseña de
        // arriba) — cierra el acceso aunque alguien adivinara el correo
        // transformado.
        userToDelete.password = crypto.randomBytes(32).toString("hex");
        userToDelete.deletedAt = new Date();
        await userToDelete.save();
        await revokeUserRefreshTokens(userToDelete._id);

        res.status(200).json({ message: "Usuario eliminado correctamente", user: sanitizeUser(userToDelete) });
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar usuario");
      }
    }
  );

  // Renueva la sesión: cambia un refresh token vigente por un access token
  // nuevo + un refresh token nuevo (rotación, el anterior deja de servir).
  // El rol se lee de la BD, no del token viejo, así que un cambio de rol
  // aplica en la siguiente renovación.
  router.post("/refresh", refreshRateLimiter, async (req, res) => {
    const rawToken = asTrimmedString(req.body?.refreshToken);
    if (!rawToken) {
      return sendError(res, 400, "REFRESH_TOKEN_REQUIRED", "Falta el refresh token.");
    }
    const invalid = () =>
      sendError(res, 401, "REFRESH_TOKEN_INVALID", "La sesión no es válida o ya expiró. Inicia sesión de nuevo.");

    try {
      const now = new Date();
      const stored = await RefreshToken.findOne({ tokenHash: hashRefreshToken(rawToken) });
      if (!stored || stored.expiresAt <= now) return invalid();

      if (stored.revokedAt) {
        // Rotado hace un instante: otra petición del mismo cliente ganó la
        // carrera. No es robo; el cliente debe usar el token que recibió esa otra.
        const recentlyRotated =
          stored.replacedAt && now.getTime() - stored.replacedAt.getTime() < REFRESH_REUSE_GRACE_MS;
        if (recentlyRotated) {
          return sendError(res, 409, "REFRESH_TOKEN_ALREADY_ROTATED", "La sesión ya se renovó. Usa el token más reciente.");
        }
        // Reutilización de un token viejo → probablemente copiado. Se cierra la sesión entera.
        if (stored.replacedAt) await revokeRefreshFamily(stored.family);
        return invalid();
      }

      const user = await User.findOne({ _id: stored.user, deletedAt: null });
      if (!user || !user.isVerified || !isValidRole(user.role)) {
        await revokeRefreshFamily(stored.family);
        return invalid();
      }

      // Condicional sobre revokedAt: si dos peticiones llegan a la vez solo
      // una rota; la otra cae en el 409 de arriba en su siguiente intento.
      const rotated = await RefreshToken.findOneAndUpdate(
        { _id: stored._id, revokedAt: null },
        { $set: { revokedAt: now, replacedAt: now } }
      );
      if (!rotated) {
        return sendError(res, 409, "REFRESH_TOKEN_ALREADY_ROTATED", "La sesión ya se renovó. Usa el token más reciente.");
      }

      const token = signAccessToken({ id: user._id, role: user.role });
      const refreshToken = await issueRefreshToken(user._id, req, stored.family);
      return res.status(200).json({ token, refreshToken });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al renovar la sesión.");
    }
  });

  // Cierra la sesión del refresh token enviado (toda su familia). Siempre
  // 204, exista o no el token, para no revelar nada. El access token sigue
  // vigente hasta que venza (JWT sin estado) — el cliente debe descartarlo.
  router.post("/logout", refreshRateLimiter, async (req, res) => {
    const rawToken = asTrimmedString(req.body?.refreshToken);
    try {
      if (rawToken) {
        const stored = await RefreshToken.findOne({ tokenHash: hashRefreshToken(rawToken) }).select("family");
        if (stored) await revokeRefreshFamily(stored.family);
      }
      return res.status(204).end();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al cerrar la sesión.");
    }
  });

  app.use("/api/users", router);
}

module.exports = {
  name: "auth",
  registerRoutes,
  models: { User: userSchema, RefreshToken: refreshTokenSchema },
  // Consumido por packages/core-api/index.js (re-exportado como `auth`) y,
  // a través de él, por backend/server.js (para armar `ctx`) y por los
  // archivos de backend/ que quedaron fuera de core-api (AgencyClient,
  // Accounting, Invoices, Infra, validationMiddleware.js).
  auth: {
    createAuthMiddleware,
    isValidRole,
    ROLES,
    STAFF_ROLES,
    validateJwtEnvConfig,
  },
};
