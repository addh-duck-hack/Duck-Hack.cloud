const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/user.model");
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/authMiddleware');
const multer = require("multer");
const nodemailer = require('nodemailer');

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
    // No aceptar role desde el cliente al registrar; forzar 'user'
    const { name, email, password } = req.body;
    const user = new User({ name, email, password, role: 'user' });
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

    res.status(201).json({ message: "Usuario registrado con éxito. Revisa tu correo para verificar la cuenta.", user });
  } catch (error) {
    res.status(400).json({ error: error.message });
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
router.put("/:id", verifyToken, upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.params.id;
    const tokenUserId = req.user.id;

    if (userId != tokenUserId){
      return res.status(401).json({ message: "Usuario no autorizado" })
    }

    const { name, role } = req.body;

    // Crear objeto de actualización con los datos enviados
    let updateData = { name, role };

    // Si se ha subido una imagen, añadir la ruta al campo profileImage
    if (req.file) {
      updateData.profileImage = req.file.path; // Guardar la ruta de la imagen en la base de datos
    }

    // Actualizar el usuario en la base de datos
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

    if (!updatedUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario actualizado correctamente", user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener todos los usuarios
router.get("/", verifyToken, async (req, res) => {
  try {
    const users = await User.find().select("_id name email");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener usuario en especifico
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.params.id;
    const tokenUserId = req.user.id;

    if (userId != tokenUserId){
      return res.status(401).json({ message: "Usuario no autorizado" })
    }

    const user = await User.findById(userId);

    // Verificar si el usuario existe
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json(user);
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
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Verificar que el usuario haya confirmado su email
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Cuenta no verificada. Revisa tu correo para activar la cuenta.' });
    }

    // Comparar la contraseña proporcionada con la almacenada en la base de datos
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Contraseña incorrecta" });
    }

    // Crear un token JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },  // Información a incluir en el token
      process.env.JWT_SECRET,             // Llave secreta para firmar el token (define una variable en .env)
      { expiresIn: '1h' }                 // Tiempo de expiración del token
    );

    // Si todo está bien, autentica el usuario (puedes generar un token JWT aquí si lo deseas)
    res.status(200).json({ message: "Inicio de sesión exitoso", token, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar un usuario por ID
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.params.id;

    // Verificar si el ID es un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "ID no válido" });
    }

    // Buscar y eliminar el usuario por su ID
    const deletedUser = await User.findByIdAndDelete(userId);

    // Verificar si el usuario existía
    if (!deletedUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario eliminado correctamente", user: deletedUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
