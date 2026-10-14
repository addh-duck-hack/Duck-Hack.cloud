// Consolida los dos `nodemailer.createTransport` que antes vivían por
// separado en backend/routes/mail.routes.js (contacto) y
// backend/routes/user.routes.js (verificación de cuenta) — mismas env vars
// (EMAIL_HOST/PORT/USER/PASS), un solo lugar. Usado por modules/mail.js y
// modules/auth.js.
const nodemailer = require("nodemailer");

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    // El registro de usuarios ya defendía un default de 587 si EMAIL_PORT
    // faltaba; el de contacto no lo tenía (parseInt(undefined) = NaN). Se
    // adopta el default en los dos casos al consolidar, es estrictamente más
    // seguro.
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    secure: false,
    // Exige STARTTLS: si el servidor no ofrece cifrado, falla en vez de
    // mandar las credenciales/el correo en claro (defensa de la revisión de
    // seguridad). Para un SMTP con TLS implícito (puerto 465) habría que usar
    // secure:true; aquí el default es 587 con STARTTLS.
    requireTLS: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

const sendMail = ({ to, subject, text, html, attachments }) => {
  const transporter = createTransporter();
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    html,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  });
};

module.exports = { sendMail, createTransporter };
