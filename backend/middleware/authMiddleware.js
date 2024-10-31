const jwt = require('jsonwebtoken');

// Middleware para verificar el token JWT
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization');

  // Verificar si el token está presente
  if (!token) {
    return res.status(401).json({ message: 'Acceso denegado. No hay token.' });
  }

  try {
    // Verificar el token usando la clave secreta
    const verified = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET);
    req.user = verified; // Agregar la información del usuario al request
    next(); // Continuar con la siguiente función
  } catch (error) {
    res.status(400).json({ message: 'Token no válido' });
  }
};

module.exports = verifyToken;
