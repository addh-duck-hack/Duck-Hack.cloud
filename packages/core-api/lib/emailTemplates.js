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

// Correo de una acción de cuenta (verificar correo, restablecer contraseña) o
// aviso de un pedido: encabezado con la marca de la tienda, saludo, párrafo,
// renglones opcionales "Etiqueta: valor" (`details`) y, si hay `url`, un botón
// con el enlace en texto por si el botón no funciona. `accent` es
// theme.accentColor de la tienda (si es un hex válido).
const accountActionEmailTemplate = ({ storeName, logoUrl, accent, title, name, intro, details = [], ctaLabel, url, note, footnote }) => {
  const brandName = storeName || "Duck-Hack";
  const color = accent && /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(accent) ? accent : BRAND.action;
  const safeName = escapeHtml(name || "");
  const greeting = safeName ? `Hola ${safeName},` : "Hola,";

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - ${escapeHtml(brandName)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BRAND.ink}; font-family:${bodyFont};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.ink};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            ${renderOrderEmailHeader(brandName, logoUrl)}
            <tr>
              <td style="background-color:${BRAND.panel}; border-radius:12px; padding:32px;">
                <h1 style="margin:0 0 16px; font-family:${monoFont}; font-size:20px; color:${BRAND.white}; font-weight:700;">
                  ${escapeHtml(title)}
                </h1>
                <p style="margin:0 0 12px; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${BRAND.textDim};">
                  ${greeting}
                </p>
                <p style="margin:0 0 24px; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${BRAND.textDim};">
                  ${escapeHtml(intro)}
                </p>
                ${details.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${details
                  .map(
                    (d) => `<tr>
                    <td style="padding:6px 0; font-family:${bodyFont}; font-size:14px; color:${BRAND.textDim}; border-bottom:1px solid ${BRAND.line};">${escapeHtml(d.label)}</td>
                    <td style="padding:6px 0; font-family:${bodyFont}; font-size:14px; color:${BRAND.white}; border-bottom:1px solid ${BRAND.line}; text-align:right;">${escapeHtml(d.value)}</td>
                  </tr>`
                  )
                  .join("")}</table>` : ""}
                ${url ? `<table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" bgcolor="${color}" style="border-radius:8px;">
                      <a href="${url}"
                         style="display:inline-block; padding:12px 24px; font-family:${monoFont}; font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:${BRAND.onAccent}; text-decoration:none; border-radius:8px;">
                        ${escapeHtml(ctaLabel)}
                      </a>
                    </td>
                  </tr>
                </table>` : ""}
                ${note ? `<p style="margin:20px 0 0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">${escapeHtml(note)}</p>` : ""}
                ${url ? `<p style="margin:24px 0 0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
                  <a href="${url}" style="color:${color}; word-break:break-all;">${url}</a>
                </p>` : ""}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;">
                <p style="margin:0; font-family:${bodyFont}; font-size:12px; color:${BRAND.textDim};">
                  ${escapeHtml(footnote)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const detailsText = details.map((d) => `${d.label}: ${d.value}`).join("\n");
  const text = `${greeting}

${intro}
${detailsText ? `\n${detailsText}\n` : ""}${url ? `${url}\n` : ""}${note ? `\n${note}\n` : ""}
${footnote}`;

  return { html, text };
};

/**
 * Correo de verificación de cuenta (al registrarse y al pedir reenvío).
 * @param {{ name?: string, verifyUrl: string, logoUrl?: string, storeName?: string, accent?: string }} params
 * @returns {{ html: string, text: string }}
 */
const verificationEmailTemplate = ({ name, verifyUrl, logoUrl, storeName, accent }) =>
  accountActionEmailTemplate({
    storeName,
    logoUrl,
    accent,
    title: "Verifica tu cuenta",
    name,
    intro: `Gracias por registrarte en ${storeName || "Duck-Hack"}. Para activar tu cuenta, confirma tu correo electrónico con el siguiente botón:`,
    ctaLabel: "Verificar mi correo",
    url: verifyUrl,
    footnote: "Si no solicitaste este correo, puedes ignorarlo con confianza.",
  });

/**
 * Correo para restablecer la contraseña (POST /api/users/forgot-password).
 * @param {{ name?: string, resetUrl: string, expiresIn?: string, logoUrl?: string, storeName?: string, accent?: string }} params
 * @returns {{ html: string, text: string }}
 */
const passwordResetEmailTemplate = ({ name, resetUrl, expiresIn, logoUrl, storeName, accent }) =>
  accountActionEmailTemplate({
    storeName,
    logoUrl,
    accent,
    title: "Restablece tu contraseña",
    name,
    intro: `Recibimos una solicitud para restablecer la contraseña de tu cuenta en ${storeName || "Duck-Hack"}. Crea una nueva con el siguiente botón:`,
    ctaLabel: "Crear contraseña nueva",
    url: resetUrl,
    note: `El enlace vence en ${expiresIn || "1 hora"} y solo funciona una vez.`,
    footnote: "Si no pediste cambiar tu contraseña, ignora este correo: tu contraseña actual sigue funcionando.",
  });

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
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textColor}; border-bottom:1px solid ${BRAND.line};">${escapeHtml(item.productName)}${item.variantLabel ? `<br><span style="font-size:12px; color:${textDimColor};">${escapeHtml(item.variantLabel)}</span>` : ""}</td>
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

// Fila del cupón (Order.discount, lib/coupons.js): el descuento en negativo o,
// si fue de envío gratis, el aviso con $0.
const discountLabelOf = (discount) => `Cupón ${discount.code}${discount.type === "free_shipping" ? " (envío gratis)" : ""}`;
const renderDiscountRowHtml = (order, textColor, textDimColor) =>
  order.discount?.code
    ? `<tr>
    <td colspan="3" style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textDimColor}; border-bottom:1px solid ${BRAND.line};">${escapeHtml(discountLabelOf(order.discount))}</td>
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textColor}; border-bottom:1px solid ${BRAND.line}; text-align:right;">${order.discount.amount > 0 ? `−${formatCurrency(order.discount.amount)}` : formatCurrency(0)}</td>
  </tr>`
    : "";
const renderDiscountLineText = (order) =>
  order.discount?.code
    ? `\n- ${discountLabelOf(order.discount)} — ${order.discount.amount > 0 ? `−${formatCurrency(order.discount.amount)}` : formatCurrency(0)}`
    : "";

const renderOrderItemLineText = (item) => {
  const priceText = item.compareAtPrice && item.compareAtPrice > item.unitPrice
    ? `${formatCurrency(item.unitPrice)} (antes ${formatCurrency(item.compareAtPrice)})`
    : formatCurrency(item.unitPrice);
  return `- ${item.productName}${item.variantLabel ? ` (${item.variantLabel})` : ""} ×${item.quantity} — ${priceText} c/u — ${formatCurrency(item.subtotal)}`;
};

// Etiquetas de entrega y pago: los pedidos nuevos traen la copia del método
// (paymentMethodLabel, ver lib/checkoutOptions.js); los anteriores, solo el
// id "transfer" / "pickup".
const paymentLabelOf = (order) =>
  order.paymentMethodLabel || PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod || "—";

const deliveryLabelOf = (order) => {
  if (order.deliveryMethod !== "pickup") return "Envío a domicilio";
  return order.pickupPoint?.name ? `Recoger en ${order.pickupPoint.name}` : "Recoger en tienda";
};

// Datos del punto de venta elegido, una línea por dato.
const pickupPointLines = (order) => {
  const point = order.deliveryMethod === "pickup" ? order.pickupPoint : null;
  if (!point?.name) return [];
  return [
    point.name,
    point.address,
    point.schedule ? `Horario: ${point.schedule}` : "",
    point.instructions,
  ].filter(Boolean);
};

const paragraphHtml = (text) =>
  `<p style="margin:0; font-family:${bodyFont}; font-size:14px; line-height:1.6; color:${BRAND.textDim};">${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`;

// Tipo de pago del pedido: "spei" o "manual". Pedidos anteriores a los
// métodos configurables: "transfer" = SPEI, "pickup" = manual.
const paymentTypeOf = (order) => order.paymentMethodType || (order.paymentMethod === "pickup" ? "manual" : "spei");

// Cuenta SPEI a la que se transfiere: la del método elegido; si no tiene
// CLABE propia (o el pedido es de antes de los métodos configurables), la
// cuenta general speiPayment. null si la tienda no la ha configurado. La
// usan este correo y la página del pedido (modules/orders.js#GET /:id/summary).
const resolveSpeiAccount = (order, storeConfig) => {
  if (paymentTypeOf(order) !== "spei") return null;
  const method = (storeConfig?.paymentMethods || []).find((m) => String(m._id) === String(order.paymentMethod));
  const spei = method?.spei?.clabe ? method.spei : storeConfig?.speiPayment;
  if (!spei?.clabe) return null;
  return {
    accountHolderName: spei.accountHolderName || "",
    bank: spei.bank || "",
    clabe: spei.clabe,
    phone: spei.phone || "",
  };
};

// Botón del correo (mismo estilo que accountActionEmailTemplate).
const ctaButtonHtml = (label, url, color) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
          <tr>
            <td align="center" bgcolor="${color}" style="border-radius:8px;">
              <a href="${url}" style="display:inline-block; padding:12px 24px; font-family:${monoFont}; font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:${BRAND.onAccent}; text-decoration:none; border-radius:8px;">${escapeHtml(label)}</a>
            </td>
          </tr>
        </table>`;

// Bloque de instrucciones de pago según el tipo de método (ver
// lib/checkoutOptions.js): "spei" usa la cuenta de resolveSpeiAccount — si
// falta la CLABE, cae al texto genérico en vez de mostrar un bloque a
// medias —; "manual" usa las instrucciones que escribió la tienda.
// `proofUploadUrl` (si la tienda deja subir el comprobante desde su sitio,
// StoreConfig.customerProofUpload) agrega el botón "Subir mi comprobante";
// responder el correo queda como alternativa.
const buildPaymentInstructions = (order, storeConfig, { proofUploadUrl, accent = BRAND.action } = {}) => {
  const type = paymentTypeOf(order);
  if (type === "manual") {
    const text = order.paymentInstructions ||
      (order.paymentMethod === "pickup"
        ? "Puedes pasar a recoger y pagar en la finca; te escribimos para coordinar."
        : "Te contactaremos para coordinar el pago de tu pedido.");
    return { html: paragraphHtml(text), text };
  }

  const spei = resolveSpeiAccount(order, storeConfig);
  if (spei) {
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
        ${proofUploadUrl
          ? `<p style="margin:0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
          Una vez hecha la transferencia, sube tu comprobante para confirmar tu pedido:
        </p>
        ${ctaButtonHtml("Subir mi comprobante", proofUploadUrl, accent)}
        <p style="margin:0; font-family:${bodyFont}; font-size:12px; line-height:1.5; color:${BRAND.textDim};">
          Si el botón no funciona, copia este enlace: <a href="${proofUploadUrl}" style="color:${accent}; word-break:break-all;">${proofUploadUrl}</a><br/>
          También puedes responder este correo con tu comprobante.
        </p>`
          : `<p style="margin:0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
          Una vez hecha la transferencia, envíanos tu comprobante respondiendo este correo para confirmar tu pedido.
        </p>`}`,
      text: `Realiza tu transferencia SPEI por ${formatCurrency(order.total)} con los siguientes datos:\n` +
        rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
        (proofUploadUrl
          ? `\n\nUna vez hecha la transferencia, sube tu comprobante para confirmar tu pedido:\n${proofUploadUrl}\nTambién puedes responder este correo con tu comprobante.`
          : `\n\nUna vez hecha la transferencia, envíanos tu comprobante respondiendo este correo para confirmar tu pedido.`),
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
const orderConfirmationEmailTemplate = ({ order, storeConfig, logoAbsoluteUrl, proofUploadUrl }) => {
  const pickup = pickupPointLines(order);
  const storeName = storeConfig?.storeName || "Tienda";
  const accent = (storeConfig?.theme?.accentColor && /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(storeConfig.theme.accentColor))
    ? storeConfig.theme.accentColor
    : BRAND.action;

  const payment = buildPaymentInstructions(order, storeConfig, { proofUploadUrl, accent });

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

                ${pickup.length
                  ? `<h2 style="margin:0 0 12px; font-family:${monoFont}; font-size:15px; color:${BRAND.white}; font-weight:700;">
                  Recoge tu pedido
                </h2>
                <div style="margin-bottom:20px;">${paragraphHtml(pickup.join("\n"))}</div>`
                  : ""}

                <h2 style="margin:0 0 12px; font-family:${monoFont}; font-size:15px; color:${BRAND.white}; font-weight:700;">
                  ¿Cómo pagar?
                </h2>
                ${payment.html}

                <p style="margin:24px 0 0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
                  Adjuntamos tu ticket del pedido en PDF. Gracias por tu compra.
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

${order.items.map(renderOrderItemLineText).join("\n")}${renderDiscountLineText(order)}${renderShippingLineText(order)}
${pickup.length ? `\nRecoge tu pedido:\n${pickup.join("\n")}\n` : ""}
¿Cómo pagar?
${payment.text}

Adjuntamos tu ticket del pedido en PDF. Gracias por tu compra.`;

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
    ${renderDiscountRowHtml(order, BRAND.white, BRAND.textDim)}
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

  const infoRows = [
    ["Cliente", `${order.customerName} <${order.customerEmail}>${order.customerPhone ? ` · ${order.customerPhone}` : ""}`],
    ["Entrega", deliveryLabelOf(order)],
    ["Método de pago", paymentLabelOf(order)],
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
${order.items.map(renderOrderItemLineText).join("\n")}${renderDiscountLineText(order)}${renderShippingLineText(order)}`;

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

// Avisos del pedido después de creado (order-notify): pago validado,
// comprobante rechazado, enviado (con guía), entregado, listo para recoger
// (con el punto de venta), recogido y cancelado — al
// cliente — y "comprobante recibido" — a la tienda. Los dispara
// modules/orders.js; cuáles se mandan lo decide StoreConfig.orderNotifications.
const ORDER_STATUS_EMAILS = {
  confirmed: {
    subject: (n) => `Pago confirmado — pedido #${n}`,
    title: "Recibimos tu pago",
    intro: (store) => `Confirmamos el pago de tu pedido. ${store} ya lo está preparando.`,
  },
  proof_rejected: {
    subject: (n) => `Revisa tu comprobante — pedido #${n}`,
    title: "No pudimos validar tu comprobante",
    intro: () => "El comprobante de pago que enviaste no se pudo validar. Revisa el motivo y envíanos uno nuevo para continuar con tu pedido.",
  },
  shipped: {
    subject: (n) => `Tu pedido #${n} va en camino`,
    title: "Tu pedido va en camino",
    intro: () => "Ya enviamos tu pedido. Con el número de guía puedes rastrearlo con la paquetería.",
  },
  ready_for_pickup: {
    subject: (n) => `Tu pedido #${n} está listo para recoger`,
    title: "Tu pedido está listo para recoger",
    intro: () => "Ya puedes pasar por tu pedido. Te esperamos en el punto de venta que elegiste.",
  },
  picked_up: {
    subject: (n) => `Pedido #${n} recogido`,
    title: "Recogiste tu pedido",
    intro: (store) => `Tu pedido aparece como recogido. ¡Gracias por comprar en ${store}!`,
  },
  delivered: {
    subject: (n) => `Pedido #${n} entregado`,
    title: "Tu pedido fue entregado",
    intro: (store) => `Tu pedido aparece como entregado. ¡Gracias por comprar en ${store}!`,
  },
  cancelled: {
    subject: (n) => `Pedido #${n} cancelado`,
    title: "Tu pedido fue cancelado",
    intro: () => "Tu pedido fue cancelado. Si tienes dudas o no esperabas este cambio, responde a este correo o contáctanos.",
  },
  proof_uploaded: {
    subject: (n) => `Comprobante recibido — pedido #${n}`,
    title: "Nuevo comprobante de pago",
    intro: () => "Se subió un comprobante de pago. Revísalo en el panel (Pedidos) para aprobarlo o rechazarlo.",
  },
};

/**
 * @param {{ kind: keyof ORDER_STATUS_EMAILS, order: object, storeConfig?: object, logoAbsoluteUrl?: string, reason?: string }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
const orderStatusEmailTemplate = ({ kind, order, storeConfig, logoAbsoluteUrl, reason, proofUploadUrl }) => {
  const copy = ORDER_STATUS_EMAILS[kind];
  if (!copy) throw new Error(`Aviso de pedido desconocido: ${kind}`);
  const storeName = storeConfig?.storeName || "Duck-Hack";
  const number = order.orderNumber ?? String(order._id);
  const shipment = order.shipment || {};
  const details = [{ label: "Pedido", value: `#${number}` }, { label: "Total", value: formatCurrency(order.total) }];
  if (kind === "proof_rejected" && reason) details.push({ label: "Motivo", value: reason });
  if (kind === "shipped") {
    if (shipment.carrier) details.push({ label: "Paquetería", value: shipment.carrier });
    if (shipment.trackingNumber) details.push({ label: "Número de guía", value: shipment.trackingNumber });
  }
  if (kind === "proof_uploaded") details.push({ label: "Cliente", value: `${order.customerName} (${order.customerEmail})` });
  // Dónde y cuándo recoger (copia del punto de venta guardada en el pedido).
  if (kind === "ready_for_pickup" && order.pickupPoint?.name) {
    details.push({ label: "Dónde", value: order.pickupPoint.name });
    if (order.pickupPoint.address) details.push({ label: "Dirección", value: order.pickupPoint.address });
    if (order.pickupPoint.schedule) details.push({ label: "Horario", value: order.pickupPoint.schedule });
    // Las "indicaciones" del punto de venta se escriben para el checkout
    // (antes de confirmar: "te avisaremos cuándo pasar…") y aquí confundirían;
    // en este correo ya puede pasar, así que va qué llevar.
    details.push({ label: "Qué llevar", value: "Puede pasar a recoger con el número del pedido y una identificación oficial." });
  }

  const trackingUrl = kind === "shipped" && /^https?:\/\//i.test(shipment.trackingUrl || "") ? shipment.trackingUrl : undefined;
  // Comprobante rechazado: botón para subir otro, si la tienda lo permite.
  const ctaUrl = kind === "proof_rejected" ? proofUploadUrl : trackingUrl;
  const { html, text } = accountActionEmailTemplate({
    storeName,
    logoUrl: logoAbsoluteUrl,
    accent: storeConfig?.theme?.accentColor,
    title: copy.title,
    name: kind === "proof_uploaded" ? "" : order.customerName,
    intro: copy.intro(storeName),
    details,
    ctaLabel: kind === "proof_rejected" ? "Subir otro comprobante" : "Rastrear mi pedido",
    url: ctaUrl,
    footnote: kind === "proof_uploaded" ? `Aviso automático de ${storeName}.` : `Este correo es un aviso automático de ${storeName} sobre tu pedido.`,
  });
  return { subject: copy.subject(number), html, text };
};

// Aviso a la tienda de productos que llegaron a su mínimo o se agotaron
// (modules/inventory.js#notifyStockAlerts). `items`: [{ name, variantLabel?,
// sku?, quantity, threshold, status: "low_stock" | "out_of_stock" }].
const lowStockEmailTemplate = ({ items, storeConfig, logoAbsoluteUrl }) => {
  const storeName = storeConfig?.storeName || "Duck-Hack";
  const outCount = items.filter((i) => i.status === "out_of_stock").length;
  const subject =
    items.length === 1
      ? `${items[0].status === "out_of_stock" ? "Agotado" : "Inventario bajo"}: ${items[0].name}${items[0].variantLabel ? ` (${items[0].variantLabel})` : ""}`
      : `Inventario: ${items.length} productos requieren atención${outCount ? ` (${outCount} ${outCount === 1 ? "agotado" : "agotados"})` : ""}`;
  const details = items.map((i) => ({
    label: `${i.name}${i.variantLabel ? ` · ${i.variantLabel}` : ""}${i.sku ? ` (${i.sku})` : ""}`,
    value: i.status === "out_of_stock" ? "Agotado" : `Quedan ${i.quantity} (mínimo ${i.threshold})`,
  }));
  const { html, text } = accountActionEmailTemplate({
    storeName,
    logoUrl: logoAbsoluteUrl,
    accent: storeConfig?.theme?.accentColor,
    title: outCount === items.length ? "Productos agotados" : "Inventario bajo",
    name: "",
    intro: "Estos productos llegaron a su mínimo de inventario o se agotaron. Los agotados ya no se muestran en la tienda hasta que registres existencias en Inventario.",
    details,
    footnote: `Aviso automático de ${storeName}. Se puede apagar en Configurar tienda → Ventas y pagos.`,
  });
  return { subject, html, text };
};

module.exports = {
  resolveSpeiAccount,
  paymentTypeOf,
  lowStockEmailTemplate,
  orderStatusEmailTemplate,
  verificationEmailTemplate,
  passwordResetEmailTemplate,
  orderConfirmationEmailTemplate,
  orderNotificationEmailTemplate,
};
