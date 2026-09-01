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
const {
  asTrimmedString,
  isValidObjectId,
  getOrCreateModel,
} = require("../lib/moduleHelpers");
const { createAuthMiddleware, isValidRole, ROLES, STAFF_ROLES } = require("../lib/authMiddleware");
const { validateJwtEnvConfig, signAccessToken, signEmailVerificationToken, verifyEmailVerificationToken } = require("../lib/jwt");
const { createRateLimiter } = require("../lib/rateLimit");
const { createSingleImageUploadMiddlewares } = require("../lib/uploads");
const { sendMail } = require("../lib/mailer");
const { verificationEmailTemplate } = require("../lib/emailTemplates");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validateEmail = (email) => EMAIL_REGEX.test(asTrimmedString(email));

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

const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;
  const user = typeof userDoc.toObject === "function" ? userDoc.toObject() : { ...userDoc };
  delete user.password;
  return user;
};

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

const validateUpdateUserPayload = (sendError) => (req, res, next) => {
  const { name, email, role } = req.body || {};

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
  const { verifyToken, authorizeRoles, authorizeSelfOrRoles, authorizeSelf } = createAuthMiddleware(sendError);

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
  const loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    code: "RATE_LIMIT_LOGIN_EXCEEDED",
    message: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
    sendError,
  });

  const { uploadMiddleware: uploadProfileImage, sanitizeAndStoreMiddleware: sanitizeProfileImageUpload } =
    createSingleImageUploadMiddlewares({
      fieldName: "profileImage",
      filePrefix: "profileImage",
      maxFileSizeMB: 5,
      sendError,
    });

  router.post("/register", registerRateLimiter, validateRegisterPayload(sendError), async (req, res) => {
    try {
      const { name, email, password } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        return sendError(res, 409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado");
      }

      const user = new User({ name, email, password, role: ROLES.CUSTOMER });
      await user.save();
      const token = signEmailVerificationToken({ id: user._id });

      const backendBase = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
      const verifyUrl = `${backendBase}/users/verify?token=${token}`;

      const { html, text } = verificationEmailTemplate({
        name: user.name,
        verifyUrl,
        logoUrl: backendBase ? `${backendBase}/logo192.png` : undefined,
      });

      // No bloquea el flujo de registro si falla el envío.
      sendMail({ to: user.email, subject: "Verifica tu cuenta - Duck Hack", html, text }).catch((err) => {
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

  router.put(
    "/:id",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeSelfOrRoles("id", ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN),
    uploadProfileImage,
    sanitizeProfileImageUpload,
    validateUpdateUserPayload(sendError),
    async (req, res) => {
      try {
        const userId = req.params.id;
        const actorRole = req.user.role;
        const actorId = String(req.user.id);

        const { name, role } = req.body;

        const updateData = {};
        if (name !== undefined) {
          updateData.name = name;
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

        if (actorRole === ROLES.STORE_ADMIN && currentUser.role === ROLES.SUPER_ADMIN) {
          return sendError(res, 403, "FORBIDDEN_EDIT_USER", "No tienes permisos para editar este usuario.");
        }

        const isSelfUpdate = actorId === String(currentUser._id);
        if (role !== undefined) {
          if (!isValidRole(role)) {
            return sendError(res, 400, "INVALID_ROLE", "Rol no válido");
          }

          if (![ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN].includes(actorRole)) {
            return sendError(res, 403, "FORBIDDEN_CHANGE_ROLE", "No tienes permisos para cambiar roles.");
          }

          if (isSelfUpdate) {
            return sendError(res, 400, "CANNOT_CHANGE_OWN_ROLE", "No puedes cambiar tu propio rol.");
          }

          if (actorRole === ROLES.STORE_ADMIN && role === ROLES.SUPER_ADMIN) {
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

        user.password = newPassword;
        await user.save();

        return res.status(200).json({ message: "Contraseña actualizada correctamente." });
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al actualizar contraseña");
      }
    }
  );

  router.get("/", verifyToken, authorizeRoles(ROLES.STORE_ADMIN, ROLES.SUPER_ADMIN), async (req, res) => {
    try {
      const users = await User.find().select("_id name email role isVerified createdAt");
      res.json(users);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener usuarios");
    }
  });

  router.get(
    "/:id",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeSelfOrRoles("id", ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN),
    async (req, res) => {
      try {
        const userId = req.params.id;
        const actorRole = req.user.role;

        const user = await User.findById(userId);

        if (!user) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        if (actorRole === ROLES.STORE_ADMIN && user.role === ROLES.SUPER_ADMIN) {
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

      const userResponse = {
        ...sanitizeUser(user),
        role: user.role,
      };
      res.status(200).json({ message: "Inicio de sesión exitoso", token, user: userResponse });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al iniciar sesión");
    }
  });

  router.delete(
    "/:id",
    validateObjectIdParam("id"),
    verifyToken,
    authorizeRoles(ROLES.STORE_ADMIN, ROLES.SUPER_ADMIN),
    async (req, res) => {
      try {
        const userId = req.params.id;
        const actorRole = req.user.role;
        const actorId = String(req.user.id);

        const userToDelete = await User.findById(userId);
        if (!userToDelete) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        if (actorRole === ROLES.STORE_ADMIN && userToDelete.role === ROLES.SUPER_ADMIN) {
          return sendError(res, 403, "FORBIDDEN_DELETE_USER", "No tienes permisos para eliminar este usuario.");
        }

        if (actorId === String(userToDelete._id)) {
          return sendError(res, 400, "CANNOT_DELETE_OWN_ACCOUNT", "No puedes eliminar tu propia cuenta.");
        }

        const deletedUser = await User.findByIdAndDelete(userId);

        if (!deletedUser) {
          return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
        }

        res.status(200).json({ message: "Usuario eliminado correctamente", user: sanitizeUser(deletedUser) });
      } catch (error) {
        return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar usuario");
      }
    }
  );

  app.use("/api/users", router);
}

module.exports = {
  name: "auth",
  registerRoutes,
  models: { User: userSchema },
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
