// Copia fiel de backend/utils/jwt.js (ahora eliminado) — mismo comportamiento,
// solo movida junto con el resto de Auth. Usada por lib/authMiddleware.js y
// por modules/auth.js.
const jwt = require("jsonwebtoken");

const JWT_ALGORITHM = "HS256";
const ACCESS_TOKEN_TYPE = "access";
const EMAIL_VERIFICATION_TOKEN_TYPE = "email_verification";
const PASSWORD_RESET_TOKEN_TYPE = "password_reset";
const ORDER_ACCESS_TOKEN_TYPE = "order_access";
const APPOINTMENT_ACCESS_TOKEN_TYPE = "appointment_access";
const EMAIL_PREFERENCES_TOKEN_TYPE = "email_preferences";
// Opcionales (no están en requiredVars para no romper .env existentes).
const DEFAULT_PASSWORD_RESET_EXPIRES_IN = "1h";
const DEFAULT_ORDER_ACCESS_EXPIRES_IN = "30d";

const readJwtConfig = () => {
  const requiredVars = [
    "JWT_SECRET",
    "JWT_ISSUER",
    "JWT_AUDIENCE",
    "JWT_ACCESS_EXPIRES_IN",
    "JWT_EMAIL_VERIFY_EXPIRES_IN",
  ];

  const missingVars = requiredVars.filter((key) => !process.env[key] || !String(process.env[key]).trim());
  if (missingVars.length > 0) {
    throw new Error(`Faltan variables JWT obligatorias: ${missingVars.join(", ")}`);
  }

  const secret = String(process.env.JWT_SECRET).trim();
  if (secret.length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
  }

  return {
    secret,
    issuer: String(process.env.JWT_ISSUER).trim(),
    audience: String(process.env.JWT_AUDIENCE).trim(),
    accessExpiresIn: String(process.env.JWT_ACCESS_EXPIRES_IN).trim(),
    emailVerifyExpiresIn: String(process.env.JWT_EMAIL_VERIFY_EXPIRES_IN).trim(),
    passwordResetExpiresIn: String(process.env.JWT_PASSWORD_RESET_EXPIRES_IN || DEFAULT_PASSWORD_RESET_EXPIRES_IN).trim(),
    orderAccessExpiresIn: String(process.env.JWT_ORDER_ACCESS_EXPIRES_IN || DEFAULT_ORDER_ACCESS_EXPIRES_IN).trim(),
  };
};

const validateJwtEnvConfig = () => {
  readJwtConfig();
  // Opcional, pero si viene mal escrito el backend no arranca (igual que el resto).
  require("./refreshTokens").readRefreshTtlMs();
};

const signAccessToken = ({ id, role }) => {
  const config = readJwtConfig();
  const subject = String(id);

  return jwt.sign(
    { id: subject, role, tokenType: ACCESS_TOKEN_TYPE },
    config.secret,
    {
      algorithm: JWT_ALGORITHM,
      issuer: config.issuer,
      audience: config.audience,
      subject,
      expiresIn: config.accessExpiresIn,
    }
  );
};

const signEmailVerificationToken = ({ id }) => {
  const config = readJwtConfig();
  const subject = String(id);

  return jwt.sign(
    { id: subject, tokenType: EMAIL_VERIFICATION_TOKEN_TYPE },
    config.secret,
    {
      algorithm: JWT_ALGORITHM,
      issuer: config.issuer,
      audience: config.audience,
      subject,
      expiresIn: config.emailVerifyExpiresIn,
    }
  );
};

const verifyAccessToken = (token) => {
  const config = readJwtConfig();
  const decoded = jwt.verify(token, config.secret, {
    algorithms: [JWT_ALGORITHM],
    issuer: config.issuer,
    audience: config.audience,
  });

  if (decoded.tokenType !== ACCESS_TOKEN_TYPE) {
    const error = new Error("Tipo de token inválido para acceso.");
    error.code = "JWT_INVALID_TOKEN_TYPE";
    throw error;
  }

  return decoded;
};

const verifyEmailVerificationToken = (token) => {
  const config = readJwtConfig();
  const decoded = jwt.verify(token, config.secret, {
    algorithms: [JWT_ALGORITHM],
    issuer: config.issuer,
    audience: config.audience,
  });

  if (decoded.tokenType !== EMAIL_VERIFICATION_TOKEN_TYPE) {
    const error = new Error("Tipo de token inválido para verificación de correo.");
    error.code = "JWT_INVALID_TOKEN_TYPE";
    throw error;
  }

  return decoded;
};

// Token para restablecer la contraseña (POST /api/users/reset-password).
// `fingerprint` es una huella del hash de contraseña actual (ver
// modules/auth.js#passwordFingerprint): al cambiar la contraseña deja de
// coincidir, así que cada enlace sirve una sola vez aunque no haya vencido.
const signPasswordResetToken = ({ id, fingerprint }) => {
  const config = readJwtConfig();
  const subject = String(id);

  return jwt.sign(
    { id: subject, tokenType: PASSWORD_RESET_TOKEN_TYPE, pwf: fingerprint },
    config.secret,
    {
      algorithm: JWT_ALGORITHM,
      issuer: config.issuer,
      audience: config.audience,
      subject,
      expiresIn: config.passwordResetExpiresIn,
    }
  );
};

const verifyPasswordResetToken = (token) => {
  const config = readJwtConfig();
  const decoded = jwt.verify(token, config.secret, {
    algorithms: [JWT_ALGORITHM],
    issuer: config.issuer,
    audience: config.audience,
  });

  if (decoded.tokenType !== PASSWORD_RESET_TOKEN_TYPE) {
    const error = new Error("Tipo de token inválido para restablecer la contraseña.");
    error.code = "JWT_INVALID_TOKEN_TYPE";
    throw error;
  }

  return decoded;
};

// Acceso de un invitado a SU pedido (subir el comprobante de pago sin cuenta).
// Lo devuelve POST /api/orders/public y solo sirve para ese pedido (`oid`);
// no es una sesión: no trae rol ni se acepta como access token.
const signOrderAccessToken = ({ orderId }) => {
  const config = readJwtConfig();
  const subject = String(orderId);
  return jwt.sign({ oid: subject, tokenType: ORDER_ACCESS_TOKEN_TYPE }, config.secret, {
    algorithm: JWT_ALGORITHM,
    issuer: config.issuer,
    audience: config.audience,
    subject,
    expiresIn: config.orderAccessExpiresIn,
  });
};

const verifyOrderAccessToken = (token) => {
  const config = readJwtConfig();
  const decoded = jwt.verify(token, config.secret, {
    algorithms: [JWT_ALGORITHM],
    issuer: config.issuer,
    audience: config.audience,
  });
  if (decoded.tokenType !== ORDER_ACCESS_TOKEN_TYPE) {
    const error = new Error("Tipo de token inválido para acceder al pedido.");
    error.code = "JWT_INVALID_TOKEN_TYPE";
    throw error;
  }
  return decoded;
};

// Acceso de una invitada a SU cita (ver, cancelar o reprogramar sin cuenta;
// header X-Appointment-Token). Lo devuelve POST /api/appointments/public y
// solo sirve para esa cita (`aid`). Vence 30 días después de la cita (una
// reprogramación emite uno nuevo), así el enlace del correo sigue sirviendo
// aunque la cita sea dentro de meses.
const signAppointmentAccessToken = ({ appointmentId, validUntil }) => {
  const config = readJwtConfig();
  const subject = String(appointmentId);
  const expiresAt = new Date(validUntil).getTime() + 30 * 24 * 60 * 60 * 1000;
  const expiresInSeconds = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
  return jwt.sign({ aid: subject, tokenType: APPOINTMENT_ACCESS_TOKEN_TYPE }, config.secret, {
    algorithm: JWT_ALGORITHM,
    issuer: config.issuer,
    audience: config.audience,
    subject,
    expiresIn: expiresInSeconds,
  });
};

const verifyAppointmentAccessToken = (token) => {
  const config = readJwtConfig();
  const decoded = jwt.verify(token, config.secret, {
    algorithms: [JWT_ALGORITHM],
    issuer: config.issuer,
    audience: config.audience,
  });
  if (decoded.tokenType !== APPOINTMENT_ACCESS_TOKEN_TYPE) {
    const error = new Error("Tipo de token inválido para acceder a la cita.");
    error.code = "JWT_INVALID_TOKEN_TYPE";
    throw error;
  }
  return decoded;
};

// Enlace "No quiero recibir estos correos" (carrito abandonado,
// modules/cart.js): solo sirve para apagar esa preferencia (`pref`) de esa
// cuenta (`uid`). Vence en 180 días.
const signEmailPreferencesToken = ({ userId, preference }) => {
  const config = readJwtConfig();
  return jwt.sign({ uid: String(userId), pref: preference, tokenType: EMAIL_PREFERENCES_TOKEN_TYPE }, config.secret, {
    algorithm: JWT_ALGORITHM,
    issuer: config.issuer,
    audience: config.audience,
    subject: String(userId),
    expiresIn: "180d",
  });
};

const verifyEmailPreferencesToken = (token) => {
  const config = readJwtConfig();
  const decoded = jwt.verify(token, config.secret, {
    algorithms: [JWT_ALGORITHM],
    issuer: config.issuer,
    audience: config.audience,
  });
  if (decoded.tokenType !== EMAIL_PREFERENCES_TOKEN_TYPE) {
    const error = new Error("Tipo de token inválido para preferencias de correo.");
    error.code = "JWT_INVALID_TOKEN_TYPE";
    throw error;
  }
  return decoded;
};

module.exports = {
  signAccessToken,
  signEmailPreferencesToken,
  verifyEmailPreferencesToken,
  signAppointmentAccessToken,
  verifyAppointmentAccessToken,
  signOrderAccessToken,
  verifyOrderAccessToken,
  signEmailVerificationToken,
  signPasswordResetToken,
  verifyAccessToken,
  verifyEmailVerificationToken,
  verifyPasswordResetToken,
  validateJwtEnvConfig,
};
