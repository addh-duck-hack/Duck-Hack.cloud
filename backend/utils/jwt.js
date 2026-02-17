const jwt = require("jsonwebtoken");

const JWT_ALGORITHM = "HS256";
const ACCESS_TOKEN_TYPE = "access";
const EMAIL_VERIFICATION_TOKEN_TYPE = "email_verification";

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
  };
};

const validateJwtEnvConfig = () => {
  readJwtConfig();
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

module.exports = {
  signAccessToken,
  signEmailVerificationToken,
  verifyAccessToken,
  verifyEmailVerificationToken,
  validateJwtEnvConfig,
};
