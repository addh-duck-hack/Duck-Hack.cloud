const mongoose = require("mongoose");
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'editor', 'user'],
    default: 'user'
  },
  profileImage: {
    type: String, // Almacena la ruta de la imagen subida
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para encriptar la contraseña antes de guardar
userSchema.pre('save', async function (next) {
  const user = this;

  // Solo encriptar la contraseña si ha sido modificada o es nueva
  if (!user.isModified('password')) {
    return next();
  }

  try {
    // Generar el hash
    const salt = await bcrypt.genSalt(10); // Genera un "salt" para añadir más seguridad
    user.password = await bcrypt.hash(user.password, salt); // Encripta la contraseña
    next(); // Procede al siguiente middleware/guardado
  } catch (error) {
    next(error); // Lanza error si hay problemas en la encriptación
  }
});

// Método para verificar contraseñas
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password); // Compara contraseñas
};

const User = mongoose.model("User", userSchema);
module.exports = User;