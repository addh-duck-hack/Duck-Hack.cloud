// backend/utils/orderPdf.js — comprobante de un pedido de la tienda.
//
// Distinto de utils/invoicePdf.js (facturación interna de Duck-Hack a sus
// clientes de agencia, con BUSINESS_INFO fijo = los datos de Duck-Hack):
// este comprobante es para el storefront de CADA tienda, así que toma la
// identidad de StoreConfig (nombre, contacto, dirección legal) en vez de un
// dato fijo — cada deploy tiene su propia tienda.
//
// Vive en backend/ (no en packages/core-api) porque pdfkit solo está
// instalado ahí — se inyecta a packages/core-api/modules/orders.js vía ctx
// (ver server.js), mismo criterio que resolveLiveMetricSources.
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { resolveUploadsDir } = require("./uploads");

const BRAND_NAVY = "#0d2130";
const BRAND_AMBER = "#f8af11";
const BRAND_TEXT_DIM = "#5b6b76";
const BRAND_LINE = "#dddddd";

const ORDER_STATUS_LABELS = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  processing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const PAYMENT_METHOD_LABELS = {
  transfer: "Transferencia / SPEI",
  pickup: "Pago en tienda",
};

const formatCurrency = (value) =>
  `$${Number(value || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

const formatDate = (date) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
};

// Resuelve el archivo del logo directo del disco (no por HTTP) — este código
// corre en el propio backend, así que no depende de BACKEND_PUBLIC_URL ni de
// que el archivo sea alcanzable desde fuera (a diferencia del <img> del
// correo, ver lib/emailTemplates.js). Solo soporta logoUrl relativo a
// /uploads (lo que deja el uploader del admin) — si es una URL externa
// absoluta (http/https), se omite: incrustarla requeriría descargarla por
// red y volver async esta función, que hoy es síncrona a propósito.
const resolveLocalLogoPath = (logoUrl) => {
  if (!logoUrl || /^https?:\/\//i.test(logoUrl)) return null;
  const uploadsDir = resolveUploadsDir();
  if (!uploadsDir) return null;
  const relative = String(logoUrl).replace(/^\/?uploads\//, "");
  const candidate = path.join(uploadsDir, relative);
  return fs.existsSync(candidate) ? candidate : null;
};

/**
 * Genera el comprobante de un pedido (sin validez fiscal, no es CFDI) y lo
 * escribe al stream de salida dado. Nunca se persiste en disco — se
 * recompone cada vez a partir del Order + StoreConfig.
 * @param {object} order - documento Order (folio, items, shippingAddress, etc.)
 * @param {object|null} storeConfig - documento StoreConfig (para el encabezado)
 * @param {NodeJS.WritableStream} outputStream
 */
const generateOrderPdf = (order, storeConfig, outputStream) => {
  const doc = new PDFDocument({ size: "letter", margin: 50 });
  doc.pipe(outputStream);

  const storeName = storeConfig?.storeName || "Tienda";
  const contactLine = [storeConfig?.contactEmail, storeConfig?.contactPhone].filter(Boolean).join("  ·  ");
  const legalAddress = storeConfig?.legalIdentity?.legalAddress;
  const logoPath = resolveLocalLogoPath(storeConfig?.logoUrl);

  // --- Encabezado: logo (si hay) + nombre de la tienda + contacto ---
  const textX = logoPath ? 96 : 50;
  if (logoPath) {
    try {
      doc.image(logoPath, 50, 44, { fit: [36, 36] });
    } catch (error) {
      // Un logo corrupto/ilegible no debe tumbar la generación del PDF.
    }
  }
  doc.fillColor(BRAND_NAVY).font("Helvetica-Bold").fontSize(20).text(storeName, textX, 48);
  let headY = 74;
  if (contactLine) {
    doc.fillColor(BRAND_TEXT_DIM).font("Helvetica").fontSize(9).text(contactLine, textX, headY);
    headY += 14;
  }
  if (legalAddress) {
    doc.fillColor(BRAND_TEXT_DIM).font("Helvetica").fontSize(9).text(legalAddress, textX, headY, { width: 300 });
  }

  doc
    .fillColor(BRAND_NAVY)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("COMPROBANTE DE PEDIDO", 50, 150, { align: "right", width: 512 });
  doc
    .fillColor(BRAND_TEXT_DIM)
    .font("Helvetica")
    .fontSize(10)
    .text(`Folio: #${order.orderNumber ?? "—"}`, 50, 172, { align: "right", width: 512 })
    .text(`Fecha: ${formatDate(order.createdAt)}`, 50, 186, { align: "right", width: 512 })
    .text(`Estado: ${ORDER_STATUS_LABELS[order.status] || order.status}`, 50, 200, { align: "right", width: 512 });

  doc.moveTo(50, 222).lineTo(562, 222).strokeColor(BRAND_AMBER).lineWidth(2).stroke();

  // --- Cliente (izquierda) y dirección de envío (derecha) ---
  doc.fillColor(BRAND_NAVY).font("Helvetica-Bold").fontSize(11).text("Cliente", 50, 240);
  doc.fillColor(BRAND_TEXT_DIM).font("Helvetica").fontSize(10);
  let y = 258;
  const clientLine = (text) => {
    doc.text(text, 50, y, { width: 240 });
    y += doc.heightOfString(text, { width: 240 }) + 3;
  };
  clientLine(order.customerName);
  clientLine(order.customerEmail);
  if (order.customerPhone) clientLine(order.customerPhone);

  const addr = order.shippingAddress;
  if (addr && addr.street) {
    doc.fillColor(BRAND_NAVY).font("Helvetica-Bold").fontSize(11).text("Dirección de envío", 320, 240);
    doc.fillColor(BRAND_TEXT_DIM).font("Helvetica").fontSize(10);
    let addrY = 258;
    const addrLine = (text) => {
      doc.text(text, 320, addrY, { width: 240 });
      addrY += doc.heightOfString(text, { width: 240 }) + 3;
    };
    if (addr.recipientName) addrLine(`${addr.recipientName}${addr.phone ? " · " + addr.phone : ""}`);
    addrLine(`${addr.street} ${addr.exteriorNumber || ""}${addr.interiorNumber ? ", Int. " + addr.interiorNumber : ""}`);
    addrLine(`${addr.neighborhood || ""}, ${addr.city || ""}, ${addr.state || ""}`);
    if (addr.zipCode) addrLine(`C.P. ${addr.zipCode}`);
    y = Math.max(y, addrY);
  }

  // --- Detalle de artículos ---
  const items = Array.isArray(order.items) ? order.items : [];
  const tableTop = y + 25;
  doc.fillColor(BRAND_NAVY).font("Helvetica-Bold").fontSize(10);
  doc.text("Producto", 50, tableTop);
  doc.text("Cant.", 340, tableTop, { width: 50, align: "right" });
  doc.text("Precio", 400, tableTop, { width: 80, align: "right" });
  doc.text("Subtotal", 482, tableTop, { width: 80, align: "right" });
  doc.moveTo(50, tableTop + 18).lineTo(562, tableTop + 18).strokeColor(BRAND_LINE).lineWidth(1).stroke();

  doc.fillColor(BRAND_TEXT_DIM).font("Helvetica").fontSize(10);
  let rowY = tableTop + 28;
  for (const item of items) {
    // Un pedido con muchos artículos no debe overlapear el pie de página.
    if (rowY > 680) {
      doc.addPage();
      rowY = 50;
    }
    // Descuento (Product.compareAtPrice al momento de la compra, ver
    // Order.items#compareAtPrice en modules/orders.js) — se muestra el precio
    // anterior tachado justo arriba del precio pagado, misma columna.
    const hasDiscount = item.compareAtPrice && item.compareAtPrice > item.unitPrice;
    const rowHeight = Math.max(doc.heightOfString(item.productName, { width: 280 }), hasDiscount ? 26 : 14);

    doc.fillColor(BRAND_TEXT_DIM).font("Helvetica").text(item.productName, 50, rowY, { width: 280 });
    doc.text(String(item.quantity), 340, rowY, { width: 50, align: "right" });

    if (hasDiscount) {
      const strikeText = formatCurrency(item.compareAtPrice);
      const strikeWidth = doc.widthOfString(strikeText);
      doc.fontSize(8).fillColor("#999999").text(strikeText, 400, rowY, { width: 80, align: "right" });
      // pdfkit no tiene "line-through" nativo — se dibuja la línea a mano
      // sobre el texto recién puesto.
      const strikeX = 400 + 80 - strikeWidth;
      doc.moveTo(strikeX, rowY + 4).lineTo(strikeX + strikeWidth, rowY + 4).strokeColor("#999999").lineWidth(0.5).stroke();
      doc.fontSize(10).fillColor(BRAND_TEXT_DIM).text(formatCurrency(item.unitPrice), 400, rowY + 11, { width: 80, align: "right" });
    } else {
      doc.fontSize(10).fillColor(BRAND_TEXT_DIM).text(formatCurrency(item.unitPrice), 400, rowY, { width: 80, align: "right" });
    }

    doc.fontSize(10).fillColor(BRAND_TEXT_DIM).text(formatCurrency(item.subtotal), 482, rowY, { width: 80, align: "right" });
    rowY += rowHeight + 10;
  }

  doc.moveTo(50, rowY).lineTo(562, rowY).strokeColor(BRAND_LINE).lineWidth(1).stroke();

  doc
    .fillColor(BRAND_NAVY)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Total", 350, rowY + 15, { width: 132, align: "right" })
    .text(formatCurrency(order.total), 482, rowY + 15, { width: 80, align: "right" });

  doc
    .fillColor(BRAND_TEXT_DIM)
    .font("Helvetica")
    .fontSize(9)
    .text(`Método de pago: ${PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}`, 50, rowY + 45);

  doc
    .fillColor("#999999")
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text("Este comprobante es informativo y no tiene validez fiscal.", 50, 720, { align: "center", width: 512 });

  doc.end();
};

module.exports = { generateOrderPdf };
