const express = require("express");
const router = express.Router();
const User = require("../models/user.model");
const { verifyToken, authorizeRoles, authorizeSelfOrRoles, authorizeSelf, isValidRole, ROLES } = require('../middleware/authMiddleware');
const {
  validateObjectIdParam,
  validateRegisterPayload,
  validateLoginPayload,
  validateUpdateUserPayload,
  validatePasswordChangePayload,
} = require("../middleware/validationMiddleware");
const {
  registerRateLimiter,
  loginRateLimiter,
} = require("../middleware/rateLimitMiddleware");
const { createSingleImageUploadMiddlewares } = require("../middleware/imageUploadMiddleware");
const { sendError } = require("../utils/httpResponses");
const nodemailer = require('nodemailer');
const {
  signAccessToken,
  signEmailVerificationToken,
  verifyEmailVerificationToken,
} = require("../utils/jwt");

const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;
  const user = typeof userDoc.toObject === "function" ? userDoc.toObject() : { ...userDoc };
  delete user.password;
  return user;
};

const {
  uploadMiddleware: uploadProfileImage,
  sanitizeAndStoreMiddleware: sanitizeProfileImageUpload,
} = createSingleImageUploadMiddlewares({
  fieldName: "profileImage",
  filePrefix: "profileImage",
  maxFileSizeMB: 5,
});

// Ruta para registrar un nuevo usuario
router.post("/register", registerRateLimiter, validateRegisterPayload, async (req, res) => {
  try {
    // No aceptar role desde el cliente al registrar; forzar 'customer'
    const { name, email, password } = req.body;

    // Verificar si el correo ya está registrado
    const existing = await User.findOne({ email });
    if (existing) {
      return sendError(res, 409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado");
    }

    const user = new User({ name, email, password, role: ROLES.CUSTOMER });
    await user.save(); // Aquí la contraseña se encriptará automáticamente
    // Generar token de verificación (expira en 24h)
    const token = signEmailVerificationToken({ id: user._id });

    // Se enviara el correo con una url de frontend para verificar el email, esto para dar visibilidad al usuario y no solo consumir un endpoint
    const backendBase = process.env.FRONTEND_URL;
    const verifyUrl = `${backendBase}/users/verify?token=${token}`;

    // Configurar transporter usando variables de entorno
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Verifica tu cuenta - Duck Hack',
      html: `<p>Hola ${user.name || ''},</p>
             <p>Gracias por registrarte. Para activar tu cuenta, haz clic en el siguiente enlace:</p>
             <p><a href="${verifyUrl}">Verificar mi correo</a></p>
             <p>Si no solicitaste este correo, ignóralo.</p>`
    };

    // Enviar correo (no bloquear el flujo si falla el envío)
    transporter.sendMail(mailOptions).catch(err => {
      console.error('Error enviando correo de verificación:', err);
    });

    res.status(201).json({
      message: "Usuario registrado con éxito. Revisa tu correo para verificar la cuenta.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    // Manejo de errores comunes
    if (error.name === 'ValidationError') {
      // Concatenar mensajes de validación de Mongoose
      const messages = Object.values(error.errors).map(e => e.message).join(', ');
      return sendError(res, 400, "VALIDATION_ERROR", messages);
    }

    // Error por clave duplicada (por si no se detectó antes)
    if (error.code === 11000) {
      return sendError(res, 409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado");
    }

    // Error genérico
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al registrar el usuario");
  }
});

// Ruta para verificar el token de email y activar la cuenta
router.get('/verify', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return sendError(res, 400, "VERIFICATION_TOKEN_REQUIRED", "Token de verificación requerido");
  }

  try {
    const decoded = verifyEmailVerificationToken(token);
    const user = await User.findById(decoded.id);
    if (!user) return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");

    if (user.isVerified) {
      return res.status(200).json({ message: 'Usuario ya verificado' });
    }

    user.isVerified = true;
    await user.save();

    res.status(200).json({ message: 'Usuario verificado correctamente' });
  } catch (err) {
    console.error('Error verificando token:', err);
    return sendError(res, 400, "VERIFICATION_TOKEN_INVALID_OR_EXPIRED", "Token inválido o expirado");
  }
});

// Ruta para actualizar un usuario y agregar imagen de perfil
router.put(
  "/:id",
  validateObjectIdParam("id"),
  verifyToken,
  authorizeSelfOrRoles("id", ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN),
  uploadProfileImage,
  sanitizeProfileImageUpload,
  validateUpdateUserPayload,
  async (req, res) => {
  try {
    const userId = req.params.id;
    const actorRole = req.user.role;
    const actorId = String(req.user.id);

    const { name, email, role } = req.body;

    // Crear objeto de actualización con los datos enviados
    const updateData = {};
    if (name !== undefined) {
      updateData.name = name;
    }

    // Si se ha subido una imagen, añadir la ruta al campo profileImage
    if (req.savedImagePath) {
      updateData.profileImage = req.savedImagePath; // Guardar la ruta sanitizada de la imagen
    }

    if (Object.keys(updateData).length === 0 && role === undefined) {
      return sendError(res, 400, "NO_UPDATE_FIELDS", "No se enviaron datos para actualizar.");
    }

    // Actualizar el usuario en la base de datos
    const currentUser = await User.findById(userId).select("role");
    if (!currentUser) {
      return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
    }

    // El store_admin no puede editar perfiles de super_admin
    if (actorRole === ROLES.STORE_ADMIN && currentUser.role === ROLES.SUPER_ADMIN) {
      return sendError(res, 403, "FORBIDDEN_EDIT_USER", "No tienes permisos para editar este usuario.");
    }

    const isSelfUpdate = actorId === String(currentUser._id);
    if (role !== undefined) {
      if (!isValidRole(role)) {
        return sendError(res, 400, "INVALID_ROLE", "Rol no válido");
      }

      // Solo admins pueden modificar rol
      if (![ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN].includes(actorRole)) {
        return sendError(res, 403, "FORBIDDEN_CHANGE_ROLE", "No tienes permisos para cambiar roles.");
      }

      // Un usuario no puede cambiar su propio rol desde este endpoint
      if (isSelfUpdate) {
        return sendError(res, 400, "CANNOT_CHANGE_OWN_ROLE", "No puedes cambiar tu propio rol.");
      }

      // Un store_admin no puede asignar ni gestionar rol super_admin
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
});

// Ruta para cambiar la contraseña del usuario autenticado (solo dueño de la cuenta)
router.patch(
  "/:id/password",
  validateObjectIdParam("id"),
  verifyToken,
  authorizeSelf("id"),
  validatePasswordChangePayload,
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
});

// Ruta para obtener todos los usuarios
router.get("/", verifyToken, authorizeRoles(ROLES.STORE_ADMIN, ROLES.SUPER_ADMIN), async (req, res) => {
  try {
    const users = await User.find().select("_id name email role isVerified createdAt");
    res.json(users);
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener usuarios");
  }
});

// Ruta para obtener usuario en especifico
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

    // Verificar si el usuario existe
    if (!user) {
      return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
    }

    // El store_admin no puede consultar detalle de super_admin
    if (actorRole === ROLES.STORE_ADMIN && user.role === ROLES.SUPER_ADMIN) {
      return sendError(res, 403, "FORBIDDEN_VIEW_USER", "No tienes permisos para consultar este usuario.");
    }

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar usuario");
  }
});

// Ruta de login
router.post("/login", loginRateLimiter, validateLoginPayload, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verificar si el usuario existe
    const user = await User.findOne({ email });
    if (!user) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "Error al iniciar sesión. Verifica tus credenciales.");
    }

    // Verificar que el usuario haya confirmado su email
    if (!user.isVerified) {
      return sendError(res, 403, "ACCOUNT_NOT_VERIFIED", "Cuenta no verificada. Revisa tu correo para activar la cuenta.");
    }

    // Comparar la contraseña proporcionada con la almacenada en la base de datos
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "Error al iniciar sesión. Verifica tus credenciales.");
    }

    if (!isValidRole(user.role)) {
      return sendError(res, 403, "ROLE_NOT_SUPPORTED", "La cuenta tiene un rol no soportado por el sistema.");
    }

    // Crear un token JWT
    const token = signAccessToken({ id: user._id, role: user.role });

    // Si todo está bien, autentica el usuario (puedes generar un token JWT aquí si lo deseas)
    const userResponse = {
      ...sanitizeUser(user),
      role: user.role,
    };
    res.status(200).json({ message: "Inicio de sesión exitoso", token, user: userResponse });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al iniciar sesión");
  }
});

// Eliminar un usuario por ID
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

    // Un store_admin no puede eliminar cuentas super_admin
    if (actorRole === ROLES.STORE_ADMIN && userToDelete.role === ROLES.SUPER_ADMIN) {
      return sendError(res, 403, "FORBIDDEN_DELETE_USER", "No tienes permisos para eliminar este usuario.");
    }

    // Evitar auto-eliminación de cuentas administrativas por accidente
    if (actorId === String(userToDelete._id)) {
      return sendError(res, 400, "CANNOT_DELETE_OWN_ACCOUNT", "No puedes eliminar tu propia cuenta.");
    }

    // Buscar y eliminar el usuario por su ID
    const deletedUser = await User.findByIdAndDelete(userId);

    // Verificar si el usuario existía
    if (!deletedUser) {
      return sendError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado");
    }

    res.status(200).json({ message: "Usuario eliminado correctamente", user: sanitizeUser(deletedUser) });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar usuario");
  }
});

module.exports = router;
