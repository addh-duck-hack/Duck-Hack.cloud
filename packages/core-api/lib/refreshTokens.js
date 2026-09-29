// Refresh tokens (sesión larga, pensado para la app móvil — la web puede
// ignorarlos). A diferencia de los tokens de lib/jwt.js NO son JWT: son una
// cadena aleatoria opaca, y en la BD solo se guarda su hash SHA-256 (modelo
// RefreshToken en modules/auth.js). Así se pueden revocar uno por uno, y un
// volcado de la BD no sirve para iniciar sesión.
//
// Cada login abre una "familia" (una sesión/dispositivo). Cada
// POST /api/users/refresh rota el token: el viejo queda revocado con
// `replacedAt` y el nuevo hereda la familia. Si llega un token ya rotado
// fuera del periodo de gracia, alguien lo copió → se revoca toda la familia.
const crypto = require("crypto");

// Opcional (no está en requiredVars de lib/jwt.js para no romper .env existentes).
const DEFAULT_REFRESH_EXPIRES_IN = "30d";
// Dos refresh casi simultáneos del mismo cliente (ej. dos requests que
// vencieron a la vez) no deben tomarse como robo del token.
const REFRESH_REUSE_GRACE_MS = 30 * 1000;

const DURATION_UNITS_MS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

// "30d", "12h", "45m", "3600s" o segundos a secas ("3600") — mismo formato
// que el resto de JWT_*_EXPIRES_IN.
const parseDurationMs = (value) => {
  const match = /^(\d+)\s*([smhd])?$/i.exec(String(value || "").trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const ms = amount * DURATION_UNITS_MS[unit];
  return ms > 0 ? ms : null;
};

const readRefreshTtlMs = () => {
  const raw = process.env.JWT_REFRESH_EXPIRES_IN || DEFAULT_REFRESH_EXPIRES_IN;
  const ms = parseDurationMs(raw);
  if (!ms) {
    throw new Error(`JWT_REFRESH_EXPIRES_IN inválido ("${raw}"). Usa por ejemplo 30d, 12h o 3600.`);
  }
  return ms;
};

const generateRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const hashRefreshToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const newFamilyId = () => crypto.randomUUID();

module.exports = {
  REFRESH_REUSE_GRACE_MS,
  parseDurationMs,
  readRefreshTtlMs,
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
};
