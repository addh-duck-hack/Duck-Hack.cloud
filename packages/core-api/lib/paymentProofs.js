// Comprobantes de pago por transferencia (SPEI) con validación manual en el
// panel. Motor genérico: hoy lo usan los pedidos (modules/orders.js) y está
// pensado para los anticipos de citas y las tarjetas de regalo (Roadmap en
// Obsidian, "Cotizaciones - Plan de modulos" §4.2) — cada documento guarda un
// arreglo `paymentProofs` con este subesquema, en orden de subida.
//
// Flujo: el cliente (o el staff, con lo que el cliente mandó por WhatsApp o
// correo) sube un comprobante → queda "pending" → el staff lo aprueba o lo
// rechaza con motivo. Un rechazo no borra nada: el cliente sube otro y queda
// el historial completo.
//
// Los archivos viven en la carpeta privada de uploads (lib/uploads.js
// #resolvePrivateDir), nunca en /uploads público.
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { resolvePrivateDir, PROOF_MIME_TYPES } = require("./uploads");

const PROOF_STATUSES = ["pending", "approved", "rejected"];
const PROOFS_SUBDIR = "payment-proofs";
const SAFE_PROOF_NAME = /^proof-[0-9]+-[0-9a-f-]{36}\.(jpg|png|pdf)$/;

const paymentProofSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, trim: true, match: SAFE_PROOF_NAME },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, min: 0 },
    originalName: { type: String, trim: true, maxlength: 200 },
    // "customer" (el dueño desde su cuenta o con el enlace del pedido) o
    // "staff" (lo capturó la tienda).
    uploadedBy: { type: String, enum: ["customer", "staff"], required: true },
    uploadedByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
    status: { type: String, enum: PROOF_STATUSES, default: "pending" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectReason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: true }
);

const proofRecordFrom = (savedProof, { uploadedBy, userId }) => ({
  fileName: savedProof.fileName,
  mimeType: savedProof.mimeType,
  size: savedProof.size,
  originalName: savedProof.originalName,
  uploadedBy,
  ...(userId ? { uploadedByUser: userId } : {}),
});

const findProof = (doc, proofId) => (doc?.paymentProofs || []).find((p) => String(p._id) === String(proofId)) || null;

// Ruta absoluta del archivo, o null si el nombre no es uno de los nuestros
// (evita path traversal aunque el nombre ya se valida en el esquema).
const proofFilePath = (fileName) => {
  if (!SAFE_PROOF_NAME.test(String(fileName || ""))) return null;
  const dir = resolvePrivateDir(PROOFS_SUBDIR);
  return dir ? path.join(dir, fileName) : null;
};

// Envía el archivo del comprobante en la respuesta (inline). Devuelve false
// si no existe para que el caller responda 404.
const streamProofFile = async (res, proof) => {
  const filePath = proofFilePath(proof?.fileName);
  if (!filePath) return false;
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }
  const extension = path.extname(filePath).slice(1);
  res.setHeader("Content-Type", PROOF_MIME_TYPES[extension] || proof.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="comprobante-${proof._id}.${extension}"`);
  // Privado: que ni el navegador ni un proxy lo guarden.
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(filePath).pipe(res);
  return true;
};

// Borra el archivo de un comprobante que se acaba de guardar si el registro
// en la BD falló (para no dejar huérfanos). Best-effort.
const discardProofFile = async (fileName) => {
  const filePath = proofFilePath(fileName);
  if (filePath) await fs.promises.unlink(filePath).catch(() => {});
};

module.exports = {
  PROOF_STATUSES,
  PROOFS_SUBDIR,
  paymentProofSchema,
  proofRecordFrom,
  findProof,
  streamProofFile,
  discardProofFile,
};
