// backend/utils/giftCardPdf.js — tarjeta de regalo imprimible (Fase 5.2).
//
// Igual que utils/orderPdf.js vive en backend/ porque pdfkit solo está
// instalado aquí; se inyecta a packages/core-api/modules/giftCards.js vía ctx
// (`generateGiftCardPdf`, ver server.js). Una hoja carta horizontal con la
// tarjeta al centro: tienda, monto, para quién, mensaje, código y vigencia.
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { resolveUploadsDir } = require("./uploads");

const DEFAULT_ACCENT = "#7a2e4a";

const formatCurrency = (value) =>
  `$${Number(value || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", year: "numeric", month: "long", day: "numeric" });

const resolveLocalLogoPath = (logoUrl) => {
  if (!logoUrl || /^https?:\/\//i.test(logoUrl)) return null;
  const uploadsDir = resolveUploadsDir();
  if (!uploadsDir) return null;
  const candidate = path.join(uploadsDir, String(logoUrl).replace(/^\/?uploads\//, ""));
  return fs.existsSync(candidate) ? candidate : null;
};

/**
 * @param {object} card - GiftCard (code, amount, recipientName, buyerName, message, expiresAt)
 * @param {object|null} storeConfig - StoreConfig (nombre, logo, color de acento)
 * @param {NodeJS.WritableStream} outputStream
 */
const generateGiftCardPdf = (card, storeConfig, outputStream) => {
  const doc = new PDFDocument({ size: "letter", layout: "landscape", margin: 40 });
  doc.pipe(outputStream);

  const accent = /^#[0-9a-f]{6}$/i.test(storeConfig?.theme?.accentColor || "") ? storeConfig.theme.accentColor : DEFAULT_ACCENT;
  const storeName = storeConfig?.storeName || "Tienda";
  const logoPath = resolveLocalLogoPath(storeConfig?.logoUrl);

  // Tarjeta: 600 × 340 centrada.
  const x = (792 - 600) / 2;
  const y = (612 - 340) / 2;
  doc.roundedRect(x, y, 600, 340, 18).fill(accent);
  doc.roundedRect(x + 14, y + 14, 572, 312, 12).lineWidth(1).strokeOpacity(0.5).stroke("#ffffff");

  let textX = x + 40;
  if (logoPath) {
    try {
      doc.image(logoPath, x + 40, y + 36, { fit: [44, 44] });
      textX = x + 96;
    } catch (error) {
      // Un logo ilegible no tumba la tarjeta.
    }
  }
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text(storeName, textX, y + 44, { width: 440 });
  doc.font("Helvetica").fontSize(11).fillOpacity(0.85).text("TARJETA DE REGALO", x + 40, y + 96, { characterSpacing: 2 });
  doc.fillOpacity(1).font("Helvetica-Bold").fontSize(54).text(formatCurrency(card.amount), x + 40, y + 116);

  const lines = [
    card.recipientName ? `Para: ${card.recipientName}` : null,
    card.buyerName ? `De: ${card.buyerName}` : null,
  ].filter(Boolean);
  doc.font("Helvetica").fontSize(13).text(lines.join("     "), x + 40, y + 190, { width: 520 });
  if (card.message) {
    doc.font("Helvetica-Oblique").fontSize(12).fillOpacity(0.9).text(`“${card.message}”`, x + 40, y + 214, { width: 520, height: 44, ellipsis: true });
  }

  doc.fillOpacity(1).roundedRect(x + 40, y + 268, 300, 40, 8).fill("#ffffff");
  doc.fillColor(accent).font("Courier-Bold").fontSize(20).text(card.code, x + 40, y + 279, { width: 300, align: "center" });
  doc
    .fillColor("#ffffff")
    .font("Helvetica")
    .fontSize(10)
    .text(card.expiresAt ? `Válida hasta el ${formatDate(card.expiresAt)}` : "Sin fecha de vencimiento", x + 356, y + 284, { width: 210, align: "right" });

  doc
    .fillColor("#666666")
    .font("Helvetica")
    .fontSize(10)
    .text("Úsala en la tienda en línea (escribe el código al pagar) o en el local. Se puede usar en partes hasta agotar el saldo.", 40, y + 360, {
      width: 712,
      align: "center",
    });

  doc.end();
};

module.exports = { generateGiftCardPdf };
