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
    enum: ['super_admin', 'store_admin', 'catalog_manager', 'order_manager', 'customer'],
    default: 'customer'
  },
  profileImage: {
    type: String, // Almacena la ruta de la imagen subida
  },
  isVerified: {
    type: Boolean,
    default: false
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
