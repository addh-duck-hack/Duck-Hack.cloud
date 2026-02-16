const { sendError } = require("../utils/httpResponses");

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || "unknown";
};

const createRateLimiter = ({ windowMs, max, code, message }) => {
  const requests = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = getClientIp(req);
    const record = requests.get(key);

    if (!record || record.resetAt <= now) {
      requests.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(max - 1));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
      return next();
    }

    if (record.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(record.resetAt / 1000)));
      return sendError(res, 429, code, message, { retryAfterSec });
    }

    record.count += 1;
    requests.set(key, record);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - record.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(record.resetAt / 1000)));
    return next();
  };
};

const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  code: "RATE_LIMIT_REGISTER_EXCEEDED",
  message: "Demasiados intentos de registro. Intenta nuevamente más tarde.",
});

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  code: "RATE_LIMIT_LOGIN_EXCEEDED",
  message: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
});

const contactEmailRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 8,
  code: "RATE_LIMIT_CONTACT_EXCEEDED",
  message: "Demasiados intentos de envío de contacto. Intenta nuevamente más tarde.",
});

module.exports = {
  createRateLimiter,
  registerRateLimiter,
  loginRateLimiter,
  contactEmailRateLimiter,
};
