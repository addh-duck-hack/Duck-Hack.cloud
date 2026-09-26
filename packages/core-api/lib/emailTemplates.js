// Copia fiel de backend/utils/emailTemplates.js (ahora eliminado) — mismo
// HTML/texto, solo movida junto con Auth. Plantillas de correo transaccional.
// HTML con estilos inline (tabla) para máxima compatibilidad entre clientes
// de correo — reproduce la paleta de marca de frontend-user (frontend-user/
// src/index.css: navy + azul señal + ámbar) ya que las variables CSS/@import
// de Google Fonts no son fiables en la mayoría de los webmail.
const BRAND = {
  ink: "#050f16",
  panel: "#0d2130",
  line: "#1c3547",
  action: "#f8af11",
  actionHover: "#ffc94d",
  onAccent: "#03141c",
  text: "#c7dbe8",
  textDim: "#7f9aab",
  white: "#f3f9ff",
};

const monoFont = "'Courier New', Courier, monospace";
const bodyFont = "Helvetica, Arial, sans-serif";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Correo de verificación de cuenta.
 * @param {{ name?: string, verifyUrl: string, logoUrl?: string }} params
 * @returns {{ html: string, text: string }}
 */
const verificationEmailTemplate = ({ name, verifyUrl, logoUrl }) => {
  const safeName = escapeHtml(name || "");
  const greeting = safeName ? `Hola ${safeName},` : "Hola,";

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Verifica tu cuenta - Duck-Hack</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BRAND.ink}; font-family:${bodyFont};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.ink};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                ${logoUrl ? `<img src="${logoUrl}" width="32" height="32" alt="Duck-Hack" style="display:inline-block; vertical-align:middle; border-radius:8px;" />` : ""}
                <span style="display:inline-block; vertical-align:middle; margin-left:10px; font-family:${monoFont}; font-size:18px; color:${BRAND.white}; letter-spacing:0.02em;">Duck-Hack</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:${BRAND.panel}; border-radius:12px; padding:32px;">
                <h1 style="margin:0 0 16px; font-family:${monoFont}; font-size:20px; color:${BRAND.white}; font-weight:700;">
                  Verifica tu cuenta
                </h1>
                <p style="margin:0 0 12px; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${BRAND.textDim};">
                  ${greeting}
                </p>
                <p style="margin:0 0 24px; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${BRAND.textDim};">
                  Gracias por registrarte en Duck-Hack. Para activar tu cuenta, confirma tu correo electrónico
                  haciendo clic en el siguiente botón:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" bgcolor="${BRAND.action}" style="border-radius:8px;">
                      <a href="${verifyUrl}"
                         style="display:inline-block; padding:12px 24px; font-family:${monoFont}; font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:${BRAND.onAccent}; text-decoration:none; border-radius:8px;">
                        Verificar mi correo
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
                  <a href="${verifyUrl}" style="color:${BRAND.action}; word-break:break-all;">${verifyUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;">
                <p style="margin:0; font-family:${bodyFont}; font-size:12px; color:${BRAND.textDim};">
                  Si no solicitaste este correo, puedes ignorarlo con confianza.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

Gracias por registrarte en Duck-Hack. Para activar tu cuenta, abre este enlace:
${verifyUrl}

Si no solicitaste este correo, ignóralo.`;

  return { html, text };
};

const formatCurrency = (value) =>
  `$${Number(value || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fila de un producto del pedido — si el producto tenía compareAtPrice al
// momento de la compra (snapshot en Order.items, ver modules/orders.js), se
// muestra tachado junto al precio pagado.
const renderOrderItemRowHtml = (item, textColor, textDimColor) => {
  const hasDiscount = item.compareAtPrice && item.compareAtPrice > item.unitPrice;
  const priceCell = hasDiscount
    ? `<span style="text-decoration:line-through; color:${textDimColor}; margin-right:6px;">${formatCurrency(item.compareAtPrice)}</span><strong style="color:${textColor};">${formatCurrency(item.unitPrice)}</strong>`
    : `<span style="color:${textColor};">${formatCurrency(item.unitPrice)}</span>`;
  return `<tr>
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textColor}; border-bottom:1px solid ${BRAND.line};">${escapeHtml(item.productName)}</td>
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textDimColor}; border-bottom:1px solid ${BRAND.line}; text-align:center;">×${item.quantity}</td>
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; border-bottom:1px solid ${BRAND.line}; text-align:right;">${priceCell}</td>
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textColor}; border-bottom:1px solid ${BRAND.line}; text-align:right;">${formatCurrency(item.subtotal)}</td>
  </tr>`;
};

// Fila "Envío" debajo de los productos — solo si el pedido cobró envío
// (Order.shippingCost > 0; los pedidos anteriores a ese campo no lo tienen).
const renderShippingRowHtml = (order, textColor, textDimColor) =>
  order.shippingCost > 0
    ? `<tr>
    <td colspan="3" style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textDimColor}; border-bottom:1px solid ${BRAND.line};">Envío</td>
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textColor}; border-bottom:1px solid ${BRAND.line}; text-align:right;">${formatCurrency(order.shippingCost)}</td>
  </tr>`
    : "";

const renderShippingLineText = (order) => (order.shippingCost > 0 ? `\n- Envío — ${formatCurrency(order.shippingCost)}` : "");

const renderOrderItemLineText = (item) => {
  const priceText = item.compareAtPrice && item.compareAtPrice > item.unitPrice
    ? `${formatCurrency(item.unitPrice)} (antes ${formatCurrency(item.compareAtPrice)})`
    : formatCurrency(item.unitPrice);
  return `- ${item.productName} ×${item.quantity} — ${priceText} c/u — ${formatCurrency(item.subtotal)}`;
};

// Bloque de instrucciones de pago — SPEI usa storeConfig.speiPayment (ver
// modules/storeConfig.js) si la tienda ya lo configuró; si falta algún dato
// clave (CLABE), cae al texto genérico anterior en vez de mostrar un bloque
// a medias. "pickup" no depende de StoreConfig, es texto fijo.
const buildPaymentInstructions = (order, storeConfig) => {
  if (order.paymentMethod === "pickup") {
    return {
      html: `<p style="margin:0; font-family:${bodyFont}; font-size:14px; line-height:1.6; color:${BRAND.textDim};">Puedes pasar a recoger y pagar en la finca; te escribimos para coordinar.</p>`,
      text: "Puedes pasar a recoger y pagar en la finca; te escribimos para coordinar.",
    };
  }

  const spei = storeConfig?.speiPayment;
  if (spei?.clabe) {
    const rows = [
      spei.accountHolderName ? ["Beneficiario", spei.accountHolderName] : null,
      spei.bank ? ["Banco", spei.bank] : null,
      ["CLABE interbancaria", spei.clabe],
      spei.phone ? ["Número de celular", spei.phone] : null,
    ].filter(Boolean);

    const htmlRows = rows
      .map(
        ([label, value]) => `<tr>
          <td style="padding:4px 12px 4px 0; font-family:${bodyFont}; font-size:13px; color:${BRAND.textDim};">${escapeHtml(label)}</td>
          <td style="padding:4px 0; font-family:${monoFont}; font-size:14px; color:${BRAND.white}; font-weight:700;">${escapeHtml(value)}</td>
        </tr>`
      )
      .join("");

    return {
      html: `<p style="margin:0 0 12px; font-family:${bodyFont}; font-size:14px; line-height:1.6; color:${BRAND.textDim};">
          Realiza tu transferencia SPEI por <strong style="color:${BRAND.white};">${formatCurrency(order.total)}</strong> con los siguientes datos:
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">${htmlRows}</table>
        <p style="margin:0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
          Una vez hecha la transferencia, envíanos tu comprobante respondiendo este correo para confirmar tu pedido.
        </p>`,
      text: `Realiza tu transferencia SPEI por ${formatCurrency(order.total)} con los siguientes datos:\n` +
        rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
        `\n\nUna vez hecha la transferencia, envíanos tu comprobante respondiendo este correo para confirmar tu pedido.`,
    };
  }

  // Fallback: la tienda todavía no configuró sus datos SPEI (Configurar
  // tienda > Pagos) — mismo texto genérico que había antes de esta plantilla.
  return {
    html: `<p style="margin:0; font-family:${bodyFont}; font-size:14px; line-height:1.6; color:${BRAND.textDim};">Te contactaremos con los datos para la transferencia; tu pedido queda apartado como pendiente de pago.</p>`,
    text: "Te contactaremos con los datos para la transferencia; tu pedido queda apartado como pendiente de pago.",
  };
};

/**
 * Correo de confirmación de pedido al cliente — con el formato/marca de la
 * tienda (nombre, logo si hay `logoUrl` absoluta, color de acento de
 * `storeConfig.theme`), detalle de productos (con descuento tachado si
 * aplica), instrucciones de pago (SPEI de la tienda o recoger en tienda), y
 * el ticket en PDF se adjunta aparte (ver sendCheckoutEmails en
 * modules/orders.js) — esta función no genera el PDF, solo el cuerpo.
 *
 * No se usa el `theme.primaryColor`/fondo personalizado de la tienda a
 * propósito: un color de fondo elegido libremente por la tienda podría dar
 * bajo contraste con el texto fijo de esta plantilla (y algunos clientes de
 * correo invierten colores en modo oscuro) — se mantiene la misma base
 * oscura confiable de verificationEmailTemplate, y solo se personaliza con
 * el nombre/logo/color de acento de la tienda. Tampoco se usan las fuentes
 * de `theme.fontFamily*` — los @import de Google Fonts no son fiables en la
 * mayoría de los webmail (mismo criterio que verificationEmailTemplate).
 * @param {{ order: object, storeConfig: object|null, logoAbsoluteUrl?: string }} params
 * @returns {{ html: string, text: string }}
 */
const orderConfirmationEmailTemplate = ({ order, storeConfig, logoAbsoluteUrl }) => {
  const storeName = storeConfig?.storeName || "Tienda";
  const accent = (storeConfig?.theme?.accentColor && /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(storeConfig.theme.accentColor))
    ? storeConfig.theme.accentColor
    : BRAND.action;

  const payment = buildPaymentInstructions(order, storeConfig);

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pedido #${order.orderNumber} — ${escapeHtml(storeName)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BRAND.ink}; font-family:${bodyFont};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.ink};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            ${renderOrderEmailHeader(storeName, logoAbsoluteUrl)}
            <tr>
              <td style="background-color:${BRAND.panel}; border-radius:12px; padding:32px;">
                <h1 style="margin:0 0 4px; font-family:${monoFont}; font-size:20px; color:${BRAND.white}; font-weight:700;">
                  ¡Gracias por tu pedido!
                </h1>
                <p style="margin:0 0 20px; font-family:${bodyFont}; font-size:14px; color:${BRAND.textDim};">
                  Pedido <strong style="color:${accent};">#${order.orderNumber}</strong> por un total de
                  <strong style="color:${BRAND.white};">${formatCurrency(order.total)}</strong>
                </p>

                ${renderOrderItemsTableHtml(order, accent)}

                <h2 style="margin:0 0 12px; font-family:${monoFont}; font-size:15px; color:${BRAND.white}; font-weight:700;">
                  ¿Cómo pagar?
                </h2>
                ${payment.html}

                <p style="margin:24px 0 0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
                  Adjuntamos tu comprobante de pedido en PDF. Gracias por tu compra.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `¡Gracias por tu pedido!

Pedido #${order.orderNumber} por un total de ${formatCurrency(order.total)}.

${order.items.map(renderOrderItemLineText).join("\n")}${renderShippingLineText(order)}

¿Cómo pagar?
${payment.text}

Adjuntamos tu comprobante de pedido en PDF. Gracias por tu compra.`;

  return { html, text };
};

const PAYMENT_METHOD_LABELS = {
  transfer: "Transferencia / SPEI",
  pickup: "Pago en tienda",
};

// Encabezado compartido (logo + nombre de tienda) entre las plantillas de
// pedido — extraído para que orderConfirmationEmailTemplate y
// orderNotificationEmailTemplate se vean idénticas en esta parte.
const renderOrderEmailHeader = (storeName, logoAbsoluteUrl) => `
  <tr>
    <td align="center" style="padding-bottom:24px;">
      ${logoAbsoluteUrl ? `<img src="${logoAbsoluteUrl}" width="32" height="32" alt="${escapeHtml(storeName)}" style="display:inline-block; vertical-align:middle; border-radius:8px;" />` : ""}
      <span style="display:inline-block; vertical-align:middle; margin-left:10px; font-family:${monoFont}; font-size:18px; color:${BRAND.white}; letter-spacing:0.02em;">${escapeHtml(storeName)}</span>
    </td>
  </tr>`;

const renderOrderItemsTableHtml = (order, accent) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr>
      <td style="padding-bottom:6px; font-family:${bodyFont}; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; color:${accent}; border-bottom:2px solid ${accent};">Producto</td>
      <td style="padding-bottom:6px; font-family:${bodyFont}; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; color:${accent}; border-bottom:2px solid ${accent}; text-align:center;">Cant.</td>
      <td style="padding-bottom:6px; font-family:${bodyFont}; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; color:${accent}; border-bottom:2px solid ${accent}; text-align:right;">Precio</td>
      <td style="padding-bottom:6px; font-family:${bodyFont}; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; color:${accent}; border-bottom:2px solid ${accent}; text-align:right;">Subtotal</td>
    </tr>
    ${order.items.map((item) => renderOrderItemRowHtml(item, BRAND.white, BRAND.textDim)).join("")}
    ${renderShippingRowHtml(order, BRAND.white, BRAND.textDim)}
  </table>`;

/**
 * Aviso interno a la tienda cuando entra un pedido del storefront — mismo
 * encabezado/marca/tabla de productos que orderConfirmationEmailTemplate
 * (para que ambos correos se vean consistentes), pero con la información que
 * necesita quien despacha el pedido en vez de instrucciones de pago: datos
 * de contacto del cliente, dirección de envío y notas. No lleva el bloque
 * "¿Cómo pagar?" (es para la tienda, no para el comprador) ni menciona un
 * PDF adjunto (este correo no lleva uno).
 * @param {{ order: object, storeConfig: object|null, logoAbsoluteUrl?: string }} params
 * @returns {{ html: string, text: string }}
 */
const orderNotificationEmailTemplate = ({ order, storeConfig, logoAbsoluteUrl }) => {
  const storeName = storeConfig?.storeName || "Tienda";
  const accent = (storeConfig?.theme?.accentColor && /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(storeConfig.theme.accentColor))
    ? storeConfig.theme.accentColor
    : BRAND.action;

  const paymentLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod;

  const infoRows = [
    ["Cliente", `${order.customerName} <${order.customerEmail}>${order.customerPhone ? ` · ${order.customerPhone}` : ""}`],
    ["Método de pago", paymentLabel],
  ];
  if (order.notes) infoRows.push(["Notas", order.notes]);

  const addr = order.shippingAddress;
  const hasAddress = Boolean(addr && addr.street);

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nuevo pedido #${order.orderNumber} — ${escapeHtml(storeName)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BRAND.ink}; font-family:${bodyFont};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.ink};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            ${renderOrderEmailHeader(storeName, logoAbsoluteUrl)}
            <tr>
              <td style="background-color:${BRAND.panel}; border-radius:12px; padding:32px;">
                <h1 style="margin:0 0 4px; font-family:${monoFont}; font-size:20px; color:${BRAND.white}; font-weight:700;">
                  Nuevo pedido del storefront
                </h1>
                <p style="margin:0 0 20px; font-family:${bodyFont}; font-size:14px; color:${BRAND.textDim};">
                  Pedido <strong style="color:${accent};">#${order.orderNumber}</strong> por un total de
                  <strong style="color:${BRAND.white};">${formatCurrency(order.total)}</strong>
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                  ${infoRows
                    .map(
                      ([label, value]) => `<tr>
                        <td style="padding:4px 12px 4px 0; font-family:${bodyFont}; font-size:13px; color:${BRAND.textDim}; vertical-align:top; white-space:nowrap;">${escapeHtml(label)}</td>
                        <td style="padding:4px 0; font-family:${bodyFont}; font-size:14px; color:${BRAND.white};">${escapeHtml(value)}</td>
                      </tr>`
                    )
                    .join("")}
                  ${hasAddress
                    ? `<tr>
                        <td style="padding:4px 12px 4px 0; font-family:${bodyFont}; font-size:13px; color:${BRAND.textDim}; vertical-align:top; white-space:nowrap;">Dirección de envío</td>
                        <td style="padding:4px 0; font-family:${bodyFont}; font-size:14px; color:${BRAND.white}; line-height:1.5;">${escapeHtml(formatShippingAddressLine(addr)).replace(/\n/g, "<br/>")}</td>
                      </tr>`
                    : ""}
                </table>

                ${renderOrderItemsTableHtml(order, accent)}

                <p style="margin:0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
                  Este aviso es solo informativo — el pedido ya quedó guardado en el panel.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Nuevo pedido del storefront.

Pedido #${order.orderNumber} por un total de ${formatCurrency(order.total)}.

${infoRows.map(([label, value]) => `${label}: ${value}`).join("\n")}
${hasAddress ? `Dirección de envío:\n${formatShippingAddressLine(addr)}\n` : ""}
${order.items.map(renderOrderItemLineText).join("\n")}${renderShippingLineText(order)}`;

  return { html, text };
};

// Misma dirección que ya se usaba en el correo de texto plano (una línea por
// dato, unida con salto de línea) — reutilizada aquí para HTML (con <br/>) y
// para el texto plano de orderNotificationEmailTemplate.
const formatShippingAddressLine = (addr) => {
  const line1 = [addr.street, addr.exteriorNumber].filter(Boolean).join(" ") +
    (addr.interiorNumber ? ` Int. ${addr.interiorNumber}` : "");
  const line2 = [addr.neighborhood, addr.city, addr.state].filter(Boolean).join(", ");
  const line3 = addr.zipCode ? `C.P. ${addr.zipCode}` : "";
  return [addr.recipientName, line1, line2, line3, addr.phone ? `Tel: ${addr.phone}` : ""].filter(Boolean).join("\n");
};

module.exports = { verificationEmailTemplate, orderConfirmationEmailTemplate, orderNotificationEmailTemplate };
