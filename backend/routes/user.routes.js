const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/user.model");
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/authMiddleware');
const multer = require("multer");

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
    const { name, email, password, role } = req.body;
    const user = new User({ name, email, password, role });
    await user.save(); // Aquí la contraseña se encriptará automáticamente
    res.status(201).json({ message: "Usuario registrado con éxito", user });
  } catch (error) {
    res.status(400).json({ error: error.message });
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
