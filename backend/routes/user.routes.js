const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/user.model");
const jwt = require('jsonwebtoken');
const { verifyToken, authorizeRoles, authorizeSelfOrRoles, authorizeSelf, isValidRole, ROLES } = require('../middleware/authMiddleware');
const multer = require("multer");
const nodemailer = require('nodemailer');

const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;
  const user = typeof userDoc.toObject === "function" ? userDoc.toObject() : { ...userDoc };
  delete user.password;
  return user;
};

// Configuración de Multer para subir imágenes a la carpeta "uploads"
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Carpeta de destino para las imágenes
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.mimetype.split('/')[1]); // Generar nombre único
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limitar el tamaño de la imagen a 5MB
  fileFilter: function (req, file, cb) {
    // Aceptar solo imágenes (jpg, jpeg, png)
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (jpg, jpeg, png)'));
    }
  }
});

// Ruta para registrar un nuevo usuario
router.post("/register", async (req, res) => {
  try {
    // No aceptar role desde el cliente al registrar; forzar 'customer'
    const { name, email, password } = req.body;

    // Verificar si el correo ya está registrado
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }

    const user = new User({ name, email, password, role: ROLES.CUSTOMER });
    await user.save(); // Aquí la contraseña se encriptará automáticamente
    // Generar token de verificación (expira en 24h)
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

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
      return res.status(400).json({ message: messages });
    }

    // Error por clave duplicada (por si no se detectó antes)
    if (error.code === 11000) {
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }

    // Error genérico
    res.status(500).json({ message: 'Error al registrar el usuario' });
  }
});

// Ruta para verificar el token de email y activar la cuenta
router.get('/verify', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({ message: 'Token de verificación requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (user.isVerified) {
      return res.status(200).json({ message: 'Usuario ya verificado' });
    }

    user.isVerified = true;
    await user.save();

    res.status(200).json({ message: 'Usuario verificado correctamente' });
  } catch (err) {
    console.error('Error verificando token:', err);
    res.status(400).json({ message: 'Token inválido o expirado' });
  }
});

// Ruta para actualizar un usuario y agregar imagen de perfil
router.put(
  "/:id",
  verifyToken,
  authorizeSelfOrRoles("id", ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN),
  upload.single('profileImage'),
  async (req, res) => {
  try {
    const userId = req.params.id;
    const actorRole = req.user.role;
    const actorId = String(req.user.id);

    const { name, email, role } = req.body;

    if (email !== undefined) {
      return res.status(400).json({ message: "El correo electrónico no puede modificarse." });
    }

    // Crear objeto de actualización con los datos enviados
    const updateData = {};
    if (name !== undefined) {
      updateData.name = name;
    }

    // Si se ha subido una imagen, añadir la ruta al campo profileImage
    if (req.file) {
      updateData.profileImage = req.file.path; // Guardar la ruta de la imagen en la base de datos
    }

    // Actualizar el usuario en la base de datos
    const currentUser = await User.findById(userId).select("role");
    if (!currentUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // El store_admin no puede editar perfiles de super_admin
    if (actorRole === ROLES.STORE_ADMIN && currentUser.role === ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "No tienes permisos para editar este usuario." });
    }

    const isSelfUpdate = actorId === String(currentUser._id);
    if (role !== undefined) {
      if (!isValidRole(role)) {
        return res.status(400).json({ message: "Rol no válido" });
      }

      // Solo admins pueden modificar rol
      if (![ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN].includes(actorRole)) {
        return res.status(403).json({ message: "No tienes permisos para cambiar roles." });
      }

      // Un usuario no puede cambiar su propio rol desde este endpoint
      if (isSelfUpdate) {
        return res.status(400).json({ message: "No puedes cambiar tu propio rol." });
      }

      // Un store_admin no puede asignar ni gestionar rol super_admin
      if (actorRole === ROLES.STORE_ADMIN && role === ROLES.SUPER_ADMIN) {
        return res.status(403).json({ message: "No tienes permisos para asignar este rol." });
      }

      updateData.role = role;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

    if (!updatedUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario actualizado correctamente", user: sanitizeUser(updatedUser) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para cambiar la contraseña del usuario autenticado (solo dueño de la cuenta)
router.patch("/:id/password", verifyToken, authorizeSelf("id"), async (req, res) => {
  try {
    const userId = req.params.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword y newPassword son requeridos." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "La contraseña actual no es correcta." });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({ message: "Contraseña actualizada correctamente." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener todos los usuarios
router.get("/", verifyToken, authorizeRoles(ROLES.STORE_ADMIN, ROLES.SUPER_ADMIN), async (req, res) => {
  try {
    const users = await User.find().select("_id name email role isVerified createdAt");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener usuario en especifico
router.get("/:id", verifyToken, authorizeSelfOrRoles("id", ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN), async (req, res) => {
  try {
    const userId = req.params.id;
    const actorRole = req.user.role;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "ID no válido" });
    }

    const user = await User.findById(userId);

    // Verificar si el usuario existe
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // El store_admin no puede consultar detalle de super_admin
    if (actorRole === ROLES.STORE_ADMIN && user.role === ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "No tienes permisos para consultar este usuario." });
    }

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta de login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verificar si el usuario existe
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Error al iniciar sesión. Verifica tus credenciales." });
    }

    // Verificar que el usuario haya confirmado su email
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Cuenta no verificada. Revisa tu correo para activar la cuenta.' });
    }

    // Comparar la contraseña proporcionada con la almacenada en la base de datos
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Error al iniciar sesión. Verifica tus credenciales." });
    }

    if (!isValidRole(user.role)) {
      return res.status(403).json({ message: "La cuenta tiene un rol no soportado por el sistema." });
    }

    // Crear un token JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },  // Información a incluir en el token
      process.env.JWT_SECRET,             // Llave secreta para firmar el token (define una variable en .env)
      { expiresIn: '1h' }                 // Tiempo de expiración del token
    );

    // Si todo está bien, autentica el usuario (puedes generar un token JWT aquí si lo deseas)
    const userResponse = {
      ...sanitizeUser(user),
      role: user.role,
    };
    res.status(200).json({ message: "Inicio de sesión exitoso", token, user: userResponse });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar un usuario por ID
router.delete("/:id", verifyToken, authorizeRoles(ROLES.STORE_ADMIN, ROLES.SUPER_ADMIN), async (req, res) => {
  try {
    const userId = req.params.id;
    const actorRole = req.user.role;
    const actorId = String(req.user.id);

    // Verificar si el ID es un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "ID no válido" });
    }

    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Un store_admin no puede eliminar cuentas super_admin
    if (actorRole === ROLES.STORE_ADMIN && userToDelete.role === ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "No tienes permisos para eliminar este usuario." });
    }

    // Evitar auto-eliminación de cuentas administrativas por accidente
    if (actorId === String(userToDelete._id)) {
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta." });
    }

    // Buscar y eliminar el usuario por su ID
    const deletedUser = await User.findByIdAndDelete(userId);

    // Verificar si el usuario existía
    if (!deletedUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario eliminado correctamente", user: sanitizeUser(deletedUser) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
