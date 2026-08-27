const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const { BUSINESS_INFO } = require("./businessInfo");

const LOGO_PATH = path.join(__dirname, "..", "assets", "logo.png");
const BRAND_NAVY = "#0d2130";
const BRAND_AMBER = "#f8af11";
const BRAND_TEXT_DIM = "#5b6b76";
const BRAND_LINE = "#dddddd";

const formatCurrency = (value) =>
  `$${Number(value).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });

/**
 * Genera el PDF de un comprobante de pago (sin validez fiscal, no es CFDI) y
 * lo escribe al stream de salida dado (la respuesta HTTP en la ruta, o un
 * archivo al probarlo localmente). El PDF nunca se persiste en disco por el
 * backend — se recompone cada vez a partir del registro de Invoice.
 * @param {object} invoice - documento Invoice (folio, concept, amount, issuedAt)
 * @param {object} client - documento AgencyClient (para la sección "Facturar a")
 * @param {NodeJS.WritableStream} outputStream
 */
const generateInvoicePdf = (invoice, client, outputStream) => {
  const doc = new PDFDocument({ size: "letter", margin: 50 });
  doc.pipe(outputStream);

  // --- Encabezado: logo + datos del negocio ---
  if (fs.existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, 50, 45, { width: 45 });
    } catch (err) {
      // Un logo corrupto/ilegible no debe impedir generar el comprobante.
    }
  }

  doc.fillColor(BRAND_NAVY).font("Helvetica-Bold").fontSize(20).text("Duck-Hack", 110, 48);
  doc
    .fillColor(BRAND_TEXT_DIM)
    .font("Helvetica")
    .fontSize(9)
    .text(BUSINESS_INFO.name, 110, 74)
    .text(BUSINESS_INFO.address, 110, 87, { width: 300 })
    .text(`Tel: ${BUSINESS_INFO.phone}  ·  RFC: ${BUSINESS_INFO.rfc}`, 110, 114);

  doc
    .fillColor(BRAND_NAVY)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("COMPROBANTE DE PAGO", 50, 150, { align: "right", width: 512 });
  doc
    .fillColor(BRAND_TEXT_DIM)
    .font("Helvetica")
    .fontSize(10)
    .text(`Folio: ${String(invoice.folio).padStart(6, "0")}`, 50, 172, { align: "right", width: 512 })
    .text(`Fecha: ${formatDate(invoice.issuedAt)}`, 50, 186, { align: "right", width: 512 });

  doc.moveTo(50, 210).lineTo(562, 210).strokeColor(BRAND_AMBER).lineWidth(2).stroke();

  // --- Facturar a ---
  const billingName = client?.billingName || client?.businessName || "—";
  doc.fillColor(BRAND_NAVY).font("Helvetica-Bold").fontSize(11).text("Facturar a", 50, 230);

  doc.fillColor(BRAND_TEXT_DIM).font("Helvetica").fontSize(10);
  let y = 248;
  doc.text(billingName, 50, y);
  y += 15;
  if (client?.billingRfc) {
    doc.text(`RFC: ${client.billingRfc}`, 50, y);
    y += 15;
  }
  if (client?.billingAddress) {
    doc.text(client.billingAddress, 50, y, { width: 320 });
    y += 15;
  }
  const billingContact = client?.billingEmail || client?.contactEmail;
  if (billingContact) {
    doc.text(billingContact, 50, y);
    y += 15;
  }

  // --- Detalle ---
  const tableTop = y + 30;
  doc.fillColor(BRAND_NAVY).font("Helvetica-Bold").fontSize(10);
  doc.text("Concepto", 50, tableTop);
  doc.text("Monto", 450, tableTop, { width: 112, align: "right" });
  doc.moveTo(50, tableTop + 18).lineTo(562, tableTop + 18).strokeColor(BRAND_LINE).lineWidth(1).stroke();

  doc.fillColor(BRAND_TEXT_DIM).font("Helvetica").fontSize(10);
  doc.text(invoice.concept, 50, tableTop + 28, { width: 380 });
  doc.text(formatCurrency(invoice.amount), 450, tableTop + 28, { width: 112, align: "right" });

  doc.moveTo(50, tableTop + 60).lineTo(562, tableTop + 60).strokeColor(BRAND_LINE).lineWidth(1).stroke();

  doc
    .fillColor(BRAND_NAVY)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Total", 350, tableTop + 75, { width: 100, align: "right" })
    .text(formatCurrency(invoice.amount), 450, tableTop + 75, { width: 112, align: "right" });

  // --- Pie ---
  doc
    .fillColor("#999999")
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text("Este comprobante es informativo y no tiene validez fiscal.", 50, 720, { align: "center", width: 512 });

  doc.end();
};

module.exports = { generateInvoicePdf };
