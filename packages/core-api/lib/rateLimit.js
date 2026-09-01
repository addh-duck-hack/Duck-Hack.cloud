// Ex-copia de backend/middleware/rateLimitMiddleware.js#createRateLimiter —
// desde que Auth se movió a core-api (que era su otro consumidor,
// register/login), este es el único lugar donde vive. `sendError` se recibe
// por parámetro en vez de importarse (mismo criterio que lib/moduleHelpers.js).
const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || "unknown";
};

// En memoria por proceso — no coordina entre múltiples instancias del
// backend (mismo límite documentado en CLAUDE.md para la copia de backend/).
const createRateLimiter = ({ windowMs, max, code, message, sendError }) => {
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

module.exports = { createRateLimiter };
