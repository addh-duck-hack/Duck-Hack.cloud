// Correo de contacto. Copia del comportamiento de backend/routes/mail.routes.js
// (ahora eliminado) — mismo endpoint POST /api/mail/send-email, sin cambios
// de contrato para el frontend.
const express = require("express");
const { asTrimmedString } = require("../lib/moduleHelpers");
const { createRateLimiter } = require("../lib/rateLimit");
const { sendMail } = require("../lib/mailer");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateContactPayload = (sendError) => (req, res, next) => {
  const fullName = asTrimmedString(req.body?.fullName);
  const email = asTrimmedString(req.body?.email).toLowerCase();
  const phone = asTrimmedString(req.body?.phone);
  const service = asTrimmedString(req.body?.service);
  const message = asTrimmedString(req.body?.message);

  if (!fullName) return sendError(res, 400, "VALIDATION_ERROR", "El nombre completo es requerido.");
  if (fullName.length < 2 || fullName.length > 100) {
    return sendError(res, 400, "VALIDATION_ERROR", "El nombre completo debe tener entre 2 y 100 caracteres.");
  }

  if (!email) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico es requerido.");
  if (!EMAIL_REGEX.test(email)) return sendError(res, 400, "VALIDATION_ERROR", "El correo electrónico no es válido.");

  if (!service) return sendError(res, 400, "VALIDATION_ERROR", "El servicio es requerido.");
  if (service.length > 120) return sendError(res, 400, "VALIDATION_ERROR", "El servicio es demasiado largo.");

  if (!message) return sendError(res, 400, "VALIDATION_ERROR", "El mensaje es requerido.");
  if (message.length < 10 || message.length > 2000) {
    return sendError(res, 400, "VALIDATION_ERROR", "El mensaje debe tener entre 10 y 2000 caracteres.");
  }

  if (phone && phone.length > 30) {
    return sendError(res, 400, "VALIDATION_ERROR", "El teléfono es demasiado largo.");
  }

  req.body = { fullName, email, phone, service, message };
  return next();
};

function registerRoutes(app, ctx) {
  const { sendError } = ctx;
  const router = express.Router();

  const contactEmailRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 8,
    code: "RATE_LIMIT_CONTACT_EXCEEDED",
    message: "Demasiados intentos de envío de contacto. Intenta nuevamente más tarde.",
    sendError,
  });

  router.post("/send-email", contactEmailRateLimiter, validateContactPayload(sendError), async (req, res) => {
    const { fullName, email, phone, service, message } = req.body;

    try {
      // CONTACT_EMAIL_TO es nuevo (antes estaba hardcodeado a un correo de
      // Duck-Hack) — cada tienda que use este módulo necesita poder recibir
      // sus propios contactos en su propio correo. Cae en EMAIL_USER (la
      // cuenta que envía) si no se configura, para no quedar sin destinatario.
      await sendMail({
        to: process.env.CONTACT_EMAIL_TO || process.env.EMAIL_USER,
        subject: `Contacto de ${fullName}`,
        text: `Nombre: ${fullName}\nCorreo: ${email}\nTeléfono: ${phone}\nServicio: ${service}\nMensaje: ${message}`,
      });
      return res.status(200).json({ message: "Email enviado" });
    } catch (error) {
      console.error("Error enviando email", error);
      return sendError(res, 500, "EMAIL_SEND_FAILED", "Error enviando email");
    }
  });

  app.use("/api/mail", router);
}

module.exports = {
  name: "mail",
  registerRoutes,
  models: {},
};
