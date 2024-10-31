const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require('nodemailer');
require("dotenv").config();
const cors = require("cors");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Conectar a MongoDB
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => console.error("Error al conectar a MongoDB", err));

// Importar y usar rutas
const userRoutes = require("./routes/user.routes");
const postRoutes = require("./routes/post.routes");
const mailRoutes = require("./routes/mail.routes");

app.use(cors()); // Permitir CORS para todas las solicitudes
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/mail", mailRoutes);
// Servir la carpeta uploads como estática
app.use('/uploads', express.static('uploads'));

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
