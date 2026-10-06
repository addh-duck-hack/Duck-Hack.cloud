// Dónde se usa un archivo de la biblioteca de medios (uploads/<archivo>).
// Lo usan modules/media.js (DELETE responde 409 MEDIA_IN_USE con el detalle)
// y modules/appointments.js (al quitar una foto de una cita, el archivo solo
// se borra si nada más lo usa). Los modelos se buscan por nombre en la
// conexión (no por import): si un módulo no está montado, se omite.
const mongoose = require("mongoose");

// Una ruta guardada puede ser "uploads/x.jpg" o una URL absoluta que termina
// en ella — ambas cuentan como uso.
const matchesMediaPath = (value, mediaPath) =>
  typeof value === "string" && (value === mediaPath || value.endsWith(`/${mediaPath}`));

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const STORE_CONFIG_LABELS = {
  logoUrl: "Logo",
  heroSlides: "Hero",
  homeBlocks: "Bloques de inicio",
  teamMembers: "Equipo",
  testimonials: "Testimonios",
  services: "Servicios",
};

// Recorre un documento y devuelve las rutas de campo (ej.
// "heroSlides[0].mediaPath") cuyo valor apunta al archivo.
const findPathsInObject = (value, mediaPath, prefix = "") => {
  if (matchesMediaPath(value, mediaPath)) return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findPathsInObject(item, mediaPath, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    return Object.entries(value).flatMap(([key, child]) => findPathsInObject(child, mediaPath, prefix ? `${prefix}.${key}` : key));
  }
  return [];
};

// [{ type, id?, field?, label }]. `exceptAppointment`: no contar esa cita
// (la que está quitando la foto).
const findMediaUsages = async (connection, mediaPath, { exceptAppointment } = {}) => {
  const { Product, User, StoreConfig, AppHome, Appointment } = connection.models;
  const pathRegex = new RegExp(`(^|/)${escapeRegex(mediaPath)}$`);
  const usages = [];

  if (Product) {
    const products = await Product.find({ images: pathRegex }).select("name").lean();
    products.forEach((p) => usages.push({ type: "product", id: String(p._id), label: `Producto: ${p.name}` }));
  }

  if (User) {
    const users = await User.find({ profileImage: pathRegex }).select("name").lean();
    users.forEach((u) => usages.push({ type: "user", id: String(u._id), label: `Foto de perfil: ${u.name || "usuario"}` }));
  }

  if (StoreConfig) {
    const config = await StoreConfig.findOne().lean();
    if (config) {
      const { _id, __v, createdAt, updatedAt, ...content } = config;
      findPathsInObject(content, mediaPath).forEach((fieldPath) => {
        const section = STORE_CONFIG_LABELS[fieldPath.split(/[.[]/)[0]] || "Configuración";
        usages.push({ type: "storeConfig", field: fieldPath, label: `Configurar tienda: ${section} (${fieldPath})` });
      });
    }
  }

  if (AppHome) {
    const home = await AppHome.findOne({ singletonKey: "default" }).select("sections").lean();
    if (home) {
      findPathsInObject({ sections: home.sections }, mediaPath).forEach((fieldPath) => {
        usages.push({ type: "appHome", field: fieldPath, label: `Home de la app (${fieldPath})` });
      });
    }
  }

  if (Appointment) {
    const filter = { "media.path": mediaPath };
    if (exceptAppointment) filter._id = { $ne: exceptAppointment };
    const appointments = await Appointment.find(filter).select("appointmentNumber customerName").lean();
    appointments.forEach((a) => usages.push({ type: "appointment", id: String(a._id), label: `Cita #${a.appointmentNumber}: ${a.customerName}` }));
  }

  return usages;
};

module.exports = { findMediaUsages, matchesMediaPath, findPathsInObject, escapeRegex };
