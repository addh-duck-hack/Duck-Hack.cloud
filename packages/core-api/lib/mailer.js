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
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

const sendMail = ({ to, subject, text, html }) => {
  const transporter = createTransporter();
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    html,
  });
};

module.exports = { sendMail, createTransporter };
