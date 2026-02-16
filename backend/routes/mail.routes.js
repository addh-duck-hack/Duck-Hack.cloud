const express = require("express");
const nodemailer = require('nodemailer');
const router = express.Router();
const { validateContactEmailPayload } = require("../middleware/validationMiddleware");
const { sendError } = require("../utils/httpResponses");

router.post('/send-email', validateContactEmailPayload, async (req, res) => {
    const { fullName, email, phone, service, message } = req.body;
  
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'a.jacobo@duck-hack.com',
      subject: `Contacto de ${fullName}`,
      text: `Nombre: ${fullName}\nCorreo: ${email}\nTeléfono: ${phone}\nServicio: ${service}\nMensaje: ${message}`,
    };
  
    try {
      await transporter.sendMail(mailOptions);
      return res.status(200).json({ message: "Email enviado" });
    } catch (error) {
      console.error("Error enviando email", error);
      return sendError(res, 500, "EMAIL_SEND_FAILED", "Error enviando email");
    }
  });

  module.exports = router;
