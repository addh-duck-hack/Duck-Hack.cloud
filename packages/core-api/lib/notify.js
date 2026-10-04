// Un solo punto para mandar avisos por canal (Fase 3, Obsidian "Fase 3 -
// Tareas programadas"). Hoy solo hay correo (lib/mailer.js). WhatsApp y SMS
// quedan listos para conectar un proveedor cuando se contrate (se cotiza
// aparte): `registerChannel("whatsapp", async (message) => …)`. Mientras no
// haya proveedor, mandar por esos canales lanza NOTIFY_CHANNEL_NOT_CONFIGURED.
const { sendMail } = require("./mailer");

const channels = new Map([
  // { to, subject, text, html, attachments }
  ["email", (message) => sendMail(message)],
]);

const registerChannel = (name, send) => {
  if (typeof send !== "function") throw new Error(`El canal "${name}" necesita una función de envío.`);
  channels.set(name, send);
};

const isChannelAvailable = (name) => channels.has(name);

const notify = async ({ channel = "email", ...message }) => {
  const send = channels.get(channel);
  if (!send) {
    const error = new Error(`El canal "${channel}" no está configurado en esta tienda.`);
    error.code = "NOTIFY_CHANNEL_NOT_CONFIGURED";
    throw error;
  }
  if (!message.to) throw new Error("Falta el destinatario del aviso.");
  return send(message);
};

module.exports = { notify, registerChannel, isChannelAvailable };
