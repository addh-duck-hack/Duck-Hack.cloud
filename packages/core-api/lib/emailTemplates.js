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
// con el enlace en texto por si el botón no funciona. `links` = enlaces
// secundarios [{ label, url }] bajo el botón (p. ej. "Agregar a Google
// Calendar"). `accent` es theme.accentColor de la tienda (si es un hex válido).
const accountActionEmailTemplate = ({ storeName, logoUrl, accent, title, name, intro, details = [], ctaLabel, url, links = [], note, footnote }) => {
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
                ${links.length ? `<p style="margin:16px 0 0; font-family:${bodyFont}; font-size:14px; line-height:1.8;">${links
                  .map((l) => `<a href="${l.url}" style="color:${color}; text-decoration:underline;">${escapeHtml(l.label)}</a>`)
                  .join("<br />")}</p>` : ""}
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
${detailsText ? `\n${detailsText}\n` : ""}${url ? `${ctaLabel ? `${ctaLabel}: ` : ""}${url}\n` : ""}${links.map((l) => `${l.label}: ${l.url}\n`).join("")}${note ? `\n${note}\n` : ""}
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
// Después del envío va lo pagado con tarjeta de regalo (también paga el envío).
const renderShippingRowHtml = (order, textColor, textDimColor) => {
  const gift = giftCardRowOf(order);
  return [
    order.shippingCost > 0 ? ["Envío", formatCurrency(order.shippingCost)] : null,
    gift ? [gift.label, `−${formatCurrency(gift.amount)}`] : null,
  ]
    .filter(Boolean)
    .map(
      ([label, value]) => `<tr>
    <td colspan="3" style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textDimColor}; border-bottom:1px solid ${BRAND.line};">${escapeHtml(label)}</td>
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textColor}; border-bottom:1px solid ${BRAND.line}; text-align:right;">${value}</td>
  </tr>`
    )
    .join("");
};

const renderShippingLineText = (order) => {
  const gift = giftCardRowOf(order);
  return `${order.shippingCost > 0 ? `\n- Envío — ${formatCurrency(order.shippingCost)}` : ""}${gift ? `\n- ${gift.label} — −${formatCurrency(gift.amount)}` : ""}`;
};

// Fila del cupón (Order.discount, lib/coupons.js): el descuento en negativo o,
// si fue de envío gratis, el aviso con $0.
const discountLabelOf = (discount) => `Cupón ${discount.code}${discount.type === "free_shipping" ? " (envío gratis)" : ""}`;
// Renglones de descuento antes del envío: cupón y puntos de lealtad usados.
const discountRowsOf = (order) =>
  [
    order.discount?.code ? { label: discountLabelOf(order.discount), amount: order.discount.amount || 0 } : null,
    order.loyalty?.redeemed > 0 ? { label: "Puntos usados", amount: order.loyalty.redeemed } : null,
  ].filter(Boolean);
// Lo pagado con tarjeta de regalo va después del envío (paga también el envío).
const giftCardRowOf = (order) => (order.giftCard?.amount > 0 ? { label: `Tarjeta de regalo ${order.giftCard.code}`, amount: order.giftCard.amount } : null);
const renderDiscountRowHtml = (order, textColor, textDimColor) =>
  discountRowsOf(order)
    .map(
      (row) => `<tr>
    <td colspan="3" style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textDimColor}; border-bottom:1px solid ${BRAND.line};">${escapeHtml(row.label)}</td>
    <td style="padding:8px 0; font-family:${bodyFont}; font-size:14px; color:${textColor}; border-bottom:1px solid ${BRAND.line}; text-align:right;">${row.amount > 0 ? `−${formatCurrency(row.amount)}` : formatCurrency(0)}</td>
  </tr>`
    )
    .join("");
const renderDiscountLineText = (order) =>
  discountRowsOf(order)
    .map((row) => `\n- ${row.label} — ${row.amount > 0 ? `−${formatCurrency(row.amount)}` : formatCurrency(0)}`)
    .join("");

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

// Cuenta SPEI de la tienda para cobros que no son pedidos (anticipo de una
// cita, tarjeta de regalo): la del primer método de pago SPEI activo con
// CLABE, o la cuenta general speiPayment. null si no hay ninguna.
const storeSpeiAccount = (storeConfig) => {
  const method = (storeConfig?.paymentMethods || []).find((m) => m.type === "spei" && m.isActive !== false && m.spei?.clabe);
  const spei = method?.spei || (storeConfig?.speiPayment?.clabe ? storeConfig.speiPayment : null);
  if (!spei) return null;
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
// Encabezado de todos los correos: logo de la tienda (si hay) + nombre. El
// logo va acotado con CSS en línea (40 px de alto, hasta 160 de ancho, sin
// deformarse): varios clientes de correo ignoran los atributos width/height y
// lo mostrarían a su tamaño real.
const renderOrderEmailHeader = (storeName, logoAbsoluteUrl) => `
  <tr>
    <td align="center" style="padding-bottom:24px;">
      ${logoAbsoluteUrl ? `<img src="${logoAbsoluteUrl}" height="40" alt="${escapeHtml(storeName)}" style="display:inline-block; vertical-align:middle; height:40px; width:auto; max-height:40px; max-width:160px; object-fit:contain; border:0; border-radius:6px;" />` : ""}
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


// ---- Citas (Fase 2.5, modules/appointments.js) ----
// `when` ya viene formateado en la zona de la tienda ("jueves, 15 de octubre
// de 2026, 10:30"). La invitada recibe el enlace a su cita (`manageUrl`) si
// el storefront lo tiene (FRONTEND_URL).
const APPOINTMENT_EMAILS = {
  booked: {
    subject: (n, store) => `Tu cita está agendada — ${store}`,
    title: "¡Tu cita está agendada!",
    intro: (store) => `Te esperamos en ${store}. Estos son los datos de tu cita:`,
  },
  booked_pending: {
    subject: (n, store) => `Recibimos tu cita — ${store}`,
    title: "Recibimos tu cita",
    intro: (store) => `Gracias por agendar en ${store}. Te avisaremos por correo en cuanto la confirmemos; tu horario ya quedó apartado.`,
  },
  confirmed: {
    subject: (n, store) => `Tu cita está confirmada — ${store}`,
    title: "Tu cita está confirmada",
    intro: (store) => `${store} confirmó tu cita. Te esperamos:`,
  },
  rescheduled: {
    subject: (n, store) => `Tu cita cambió de horario — ${store}`,
    title: "Tu cita cambió de horario",
    intro: () => "Tu cita quedó en el nuevo horario. Actualiza tu calendario con el archivo adjunto:",
  },
  reminder: {
    subject: (n, store) => `Recordatorio de tu cita — ${store}`,
    title: "Te esperamos pronto",
    intro: (store) => `Te recordamos tu cita en ${store}. ¿Nos confirmas que vienes?`,
  },
  cancelled: {
    subject: (n, store) => `Tu cita se canceló — ${store}`,
    title: "Tu cita se canceló",
    intro: () => "Tu cita se canceló. Si quieres, agenda otra cuando gustes.",
  },
  // Anticipo (Fase 5.1).
  booked_deposit: {
    subject: (n, store) => `Aparta tu cita con tu anticipo — ${store}`,
    title: "Tu horario está apartado",
    intro: (store) => `Gracias por agendar en ${store}. Para confirmar tu cita, transfiere el anticipo y sube tu comprobante antes de la fecha límite; si no, el horario se libera.`,
  },
  deposit_approved: {
    subject: (n, store) => `Recibimos tu anticipo — ${store}`,
    title: "¡Recibimos tu anticipo!",
    intro: (store) => `${store} validó tu anticipo. Te esperamos:`,
  },
  deposit_rejected: {
    subject: (n, store) => `Revisa tu anticipo — ${store}`,
    title: "No pudimos validar tu comprobante",
    intro: () => "Tu horario sigue apartado, pero necesitamos un comprobante válido de tu anticipo antes de la nueva fecha límite:",
  },
  deposit_expired: {
    subject: (n, store) => `Tu cita se liberó — ${store}`,
    title: "Tu cita se liberó",
    intro: () => "No recibimos el anticipo a tiempo, así que el horario se liberó. Si aún quieres tu cita, agenda de nuevo cuando gustes.",
  },
};

const DEPOSIT_AWAITING_KINDS = ["booked_deposit", "deposit_rejected"];

// Renglones del anticipo: monto, lo ya validado o, si se espera, la cuenta,
// el concepto y la fecha límite.
const depositDetails = (deposit) => {
  if (!deposit?.amount) return [];
  const rows = [{ label: "Anticipo", value: formatCurrency(deposit.amount) }];
  if (deposit.awaiting) {
    if (deposit.spei) {
      if (deposit.spei.accountHolderName) rows.push({ label: "Beneficiario", value: deposit.spei.accountHolderName });
      if (deposit.spei.bank) rows.push({ label: "Banco", value: deposit.spei.bank });
      rows.push({ label: "CLABE", value: deposit.spei.clabe });
    }
    if (deposit.concept) rows.push({ label: "Concepto", value: deposit.concept });
    if (deposit.dueText) rows.push({ label: "Fecha límite", value: deposit.dueText });
  }
  return rows;
};

const appointmentDetails = ({ appointment, when, address }) =>
  [
    { label: "Folio", value: `#${appointment.appointmentNumber}` },
    { label: "Cuándo", value: when },
    { label: appointment.services.length > 1 ? "Servicios" : "Servicio", value: appointment.services.map((s) => s.name).join(" + ") },
    { label: "Con", value: appointment.specialistName },
    { label: "Duración", value: `${appointment.durationMin} min` },
    { label: "Total", value: formatCurrency(appointment.total) },
    address ? { label: "Dónde", value: address } : null,
  ].filter(Boolean);

const appointmentEmailTemplate = ({ kind, appointment, when, address, branding, manageUrl, confirmUrl, googleUrl, reason, changeHours, deposit }) => {
  const config = APPOINTMENT_EMAILS[kind];
  const store = branding.storeName || "Duck-Hack";
  const isCancelled = kind === "cancelled" || kind === "deposit_expired";
  const isReminder = kind === "reminder";
  const awaitingDeposit = DEPOSIT_AWAITING_KINDS.includes(kind);
  const notes = [];
  if (isReminder && !manageUrl) notes.push("Si no puedes asistir, avísanos para liberar tu horario.");
  if ((isCancelled || kind === "deposit_rejected") && reason) notes.push(`Motivo: ${reason}`);
  if (awaitingDeposit) {
    notes.push(
      manageUrl
        ? "Cuando transfieras, sube tu comprobante desde la página de tu cita."
        : "Cuando transfieras, responde este correo con tu comprobante."
    );
  }
  if (!isCancelled && changeHours) notes.push(`Puedes cancelar o reprogramar hasta ${changeHours} horas antes.`);
  const { html, text } = accountActionEmailTemplate({
    ...branding,
    title: config.title,
    name: appointment.customerName,
    intro: config.intro(store),
    details: [...appointmentDetails({ appointment, when, address }), ...depositDetails({ ...deposit, awaiting: awaitingDeposit })],
    ctaLabel: isCancelled ? "Agendar otra cita" : isReminder ? "Confirmo mi asistencia" : awaitingDeposit ? "Subir mi comprobante" : "Ver mi cita",
    url: (isReminder ? confirmUrl : manageUrl) || undefined,
    links: [
      isReminder && manageUrl ? { label: "Reprogramar o cancelar", url: manageUrl } : null,
      !isCancelled && googleUrl ? { label: "Agregar a Google Calendar", url: googleUrl } : null,
    ].filter(Boolean),
    note: notes.join(" ") || undefined,
    footnote: isCancelled ? `${store}` : "Adjuntamos el archivo de calendario (.ics) para Apple Calendar u Outlook.",
  });
  return { subject: config.subject(appointment.appointmentNumber, store), html, text };
};

// Aviso al negocio: cita nueva desde el sitio, o cancelada / reprogramada
// por la clienta.
const APPOINTMENT_BUSINESS_EMAILS = {
  new: { subject: (a) => `Nueva cita #${a.appointmentNumber} — ${a.customerName}`, title: "Nueva cita", intro: "Se agendó una cita desde el sitio:" },
  cancelled: { subject: (a) => `Cita #${a.appointmentNumber} cancelada por la clienta`, title: "La clienta canceló su cita", intro: "Este horario quedó libre:" },
  rescheduled: { subject: (a) => `Cita #${a.appointmentNumber} reprogramada por la clienta`, title: "La clienta cambió su cita", intro: "La cita quedó en este nuevo horario:" },
  // Anticipo (Fase 5.1).
  deposit_proof: { subject: (a) => `Comprobante de anticipo — cita #${a.appointmentNumber}`, title: "Llegó un comprobante de anticipo", intro: "Revísalo en la agenda para confirmar la cita:" },
  deposit_expired: { subject: (a) => `Cita #${a.appointmentNumber} liberada: no se pagó el anticipo`, title: "Se liberó una cita sin anticipo", intro: "No llegó el anticipo a tiempo y el horario quedó libre:" },
};

const APPOINTMENT_STATUS_LABELS = {
  pending_deposit: "Esperando anticipo",
  deposit_review: "Anticipo en revisión",
  pending: "Por confirmar",
  confirmed: "Confirmada",
  completed: "Completada",
  no_show: "No asistió",
  cancelled: "Cancelada",
};

const appointmentBusinessEmailTemplate = ({ kind, appointment, when, previousWhen, branding, adminUrl, reason }) => {
  const config = APPOINTMENT_BUSINESS_EMAILS[kind];
  const details = [
    ...appointmentDetails({ appointment, when }),
    { label: "Clienta", value: appointment.customerName },
    appointment.customerPhone ? { label: "Teléfono", value: appointment.customerPhone } : null,
    appointment.customerEmail ? { label: "Correo", value: appointment.customerEmail } : null,
    previousWhen ? { label: "Antes", value: previousWhen } : null,
    appointment.notes ? { label: "Notas", value: appointment.notes } : null,
    reason ? { label: "Motivo", value: reason } : null,
    appointment.depositAmount ? { label: "Anticipo", value: formatCurrency(appointment.depositAmount) } : null,
    { label: "Estado", value: APPOINTMENT_STATUS_LABELS[appointment.status] || appointment.status },
  ].filter(Boolean);
  const { html, text } = accountActionEmailTemplate({
    ...branding,
    title: config.title,
    intro: config.intro,
    details,
    ctaLabel: adminUrl ? "Abrir la agenda" : undefined,
    url: adminUrl || undefined,
    note:
      appointment.status === "pending" && kind === "new"
        ? "Está por confirmar: confírmala desde la agenda del panel."
        : appointment.status === "pending_deposit" && kind === "new"
          ? "Espera el anticipo: se confirma cuando apruebes su comprobante, o se libera sola si vence."
          : kind === "deposit_proof"
            ? "Apruébalo o recházalo desde la cita en la agenda."
            : undefined,
    footnote: "Aviso automático de la agenda.",
  });
  return { subject: config.subject(appointment), html, text };
};

// Aviso de favoritos (Fase 4.3, modules/wishlist.js): un favorito agotado
// volvió a estar disponible. product: { name, price, fromPrice, imageUrl }.
// Correo de marketing: lleva el enlace para darse de baja.
const wishlistBackInStockEmailTemplate = ({ branding, name, product, productUrl, unsubscribeUrl }) => {
  const store = branding.storeName || "Duck-Hack";
  const color = branding.accent && /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(branding.accent) ? branding.accent : BRAND.action;
  const safeName = escapeHtml(name || "");
  const price = `${product.fromPrice ? "Desde " : ""}${formatCurrency(product.price)}`;
  const html = `<!DOCTYPE html>
<html lang="es">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Ya está disponible - ${escapeHtml(store)}</title></head>
  <body style="margin:0; padding:0; background-color:${BRAND.ink}; font-family:${bodyFont};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.ink};">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          ${renderOrderEmailHeader(store, branding.logoUrl)}
          <tr><td style="background-color:${BRAND.panel}; border-radius:12px; padding:32px;">
            <h1 style="margin:0 0 16px; font-family:${monoFont}; font-size:20px; color:${BRAND.white}; font-weight:700;">¡Ya está disponible!</h1>
            <p style="margin:0 0 20px; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${BRAND.textDim};">${safeName ? `Hola ${safeName}, u` : "U"}n producto de tus favoritos volvió a tener existencias:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              ${product.imageUrl ? `<td width="96" style="padding:0 16px 0 0;"><img src="${product.imageUrl}" width="88" height="88" alt="" style="display:block; width:88px; height:88px; border-radius:10px; object-fit:cover;" /></td>` : ""}
              <td style="font-family:${bodyFont}; font-size:16px; color:${BRAND.white};">
                <strong>${escapeHtml(product.name)}</strong><br />
                <span style="color:${BRAND.textDim}; font-size:14px;">${price}</span>
              </td>
            </tr></table>
            ${productUrl ? ctaButtonHtml("Verlo en la tienda", productUrl, color) : ""}
            <p style="margin:16px 0 0; font-family:${bodyFont}; font-size:12px; color:${BRAND.textDim};">Las existencias pueden agotarse de nuevo; se confirman al pagar.</p>
          </td></tr>
          <tr><td align="center" style="padding-top:24px;">
            ${unsubscribeUrl ? `<p style="margin:0; font-family:${bodyFont}; font-size:12px; color:${BRAND.textDim};"><a href="${unsubscribeUrl}" style="color:${BRAND.textDim};">No quiero recibir avisos de mis favoritos</a></p>` : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `${safeName ? `Hola ${name},\n\n` : ""}Un producto de tus favoritos en ${store} volvió a estar disponible:

${product.name} — ${price}
${productUrl ? `\nVerlo en la tienda: ${productUrl}\n` : ""}
Las existencias pueden agotarse de nuevo; se confirman al pagar.
${unsubscribeUrl ? `\nNo quiero recibir avisos de mis favoritos: ${unsubscribeUrl}` : ""}`;
  return { subject: `¡Ya está disponible! ${product.name} — ${store}`, html, text };
};

// Reseña post-cita (Fase 4.2): invitación a calificar una cita completada.
const appointmentReviewRequestEmailTemplate = ({ appointment, when, branding, rateUrl }) => {
  const store = branding.storeName || "Duck-Hack";
  const { html, text } = accountActionEmailTemplate({
    ...branding,
    title: "¿Cómo te fue en tu cita?",
    name: appointment.customerName,
    intro: `Gracias por visitarnos en ${store}. Nos encantaría saber qué te pareció: calificar te toma un minuto.`,
    details: [
      { label: "Cuándo", value: when },
      { label: "Servicios", value: appointment.services.map((s) => s.name).join(" + ") },
      { label: "Con", value: appointment.specialistName },
    ],
    ctaLabel: "Calificar mi cita",
    url: rateUrl,
    note: "Tu opinión nos ayuda a mejorar y a que más personas nos conozcan.",
    footnote: `${store}`,
  });
  return { subject: `¿Cómo te fue en tu cita? — ${store}`, html, text };
};

// ---- Carrito abandonado (Fase 3.4, modules/cart.js) ----
// items: [{ name, variantLabel, qty, price, imageUrl }] con precios actuales;
// coupon (opcional): { code, label, endsAt (texto) }. Correo de marketing:
// lleva el enlace para darse de baja (`unsubscribeUrl`).
const abandonedCartEmailTemplate = ({ branding, name, items, total, cartUrl, coupon, unsubscribeUrl }) => {
  const store = branding.storeName || "Duck-Hack";
  const color = branding.accent && /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(branding.accent) ? branding.accent : BRAND.action;
  const safeName = escapeHtml(name || "");
  const rows = items
    .map(
      (item) => `<tr>
        <td width="56" style="padding:8px 12px 8px 0; border-bottom:1px solid ${BRAND.line};">
          ${item.imageUrl ? `<img src="${item.imageUrl}" width="48" height="48" alt="" style="display:block; width:48px; height:48px; border-radius:8px; object-fit:cover;" />` : ""}
        </td>
        <td style="padding:8px 0; border-bottom:1px solid ${BRAND.line}; font-family:${bodyFont}; font-size:14px; color:${BRAND.white};">
          ${escapeHtml(item.name)}${item.variantLabel ? `<br /><span style="color:${BRAND.textDim}; font-size:12px;">${escapeHtml(item.variantLabel)}</span>` : ""}
          <br /><span style="color:${BRAND.textDim}; font-size:12px;">×${item.qty}</span>
        </td>
        <td align="right" style="padding:8px 0; border-bottom:1px solid ${BRAND.line}; font-family:${bodyFont}; font-size:14px; color:${BRAND.white}; white-space:nowrap;">${formatCurrency(item.price * item.qty)}</td>
      </tr>`
    )
    .join("");
  const couponHtml = coupon
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
        <tr><td style="border:1px dashed ${color}; border-radius:10px; padding:14px; text-align:center;">
          <p style="margin:0 0 6px; font-family:${bodyFont}; font-size:14px; color:${BRAND.text};">Un regalo para terminar tu compra: <strong style="color:${BRAND.white};">${escapeHtml(coupon.label)}</strong></p>
          <p style="margin:0; font-family:${monoFont}; font-size:22px; font-weight:700; letter-spacing:0.08em; color:${color};">${escapeHtml(coupon.code)}</p>
          <p style="margin:6px 0 0; font-family:${bodyFont}; font-size:12px; color:${BRAND.textDim};">Escríbelo en tu carrito. Válido hasta el ${escapeHtml(coupon.endsAt)}, una sola vez y solo con tu cuenta.</p>
        </td></tr>
      </table>`
    : "";
  const html = `<!DOCTYPE html>
<html lang="es">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Tu carrito te espera - ${escapeHtml(store)}</title></head>
  <body style="margin:0; padding:0; background-color:${BRAND.ink}; font-family:${bodyFont};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.ink};">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          ${renderOrderEmailHeader(store, branding.logoUrl)}
          <tr><td style="background-color:${BRAND.panel}; border-radius:12px; padding:32px;">
            <h1 style="margin:0 0 16px; font-family:${monoFont}; font-size:20px; color:${BRAND.white}; font-weight:700;">Tu carrito te espera</h1>
            <p style="margin:0 0 20px; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${BRAND.textDim};">${safeName ? `Hola ${safeName}, d` : "D"}ejaste estos productos en tu carrito. Te los guardamos:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
              <tr><td></td><td style="padding:12px 0 0; font-family:${bodyFont}; font-size:15px; color:${BRAND.white}; font-weight:700;">Total</td>
              <td align="right" style="padding:12px 0 0; font-family:${bodyFont}; font-size:15px; color:${BRAND.white}; font-weight:700;">${formatCurrency(total)}</td></tr>
            </table>
            ${couponHtml}
            ${cartUrl ? ctaButtonHtml("Terminar mi compra", cartUrl, color) : ""}
            <p style="margin:16px 0 0; font-family:${bodyFont}; font-size:12px; color:${BRAND.textDim};">Precios y existencias al momento de este correo; se confirman al pagar.</p>
          </td></tr>
          <tr><td align="center" style="padding-top:24px;">
            ${unsubscribeUrl ? `<p style="margin:0; font-family:${bodyFont}; font-size:12px; color:${BRAND.textDim};"><a href="${unsubscribeUrl}" style="color:${BRAND.textDim};">No quiero recibir estos recordatorios</a></p>` : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `${safeName ? `Hola ${name},\n\n` : ""}Dejaste estos productos en tu carrito en ${store}:

${items.map((i) => `- ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} ×${i.qty} — ${formatCurrency(i.price * i.qty)}`).join("\n")}
Total: ${formatCurrency(total)}
${coupon ? `\nUn regalo para terminar tu compra: ${coupon.label}. Código ${coupon.code} (válido hasta el ${coupon.endsAt}, una sola vez y solo con tu cuenta).\n` : ""}${cartUrl ? `\nTerminar mi compra: ${cartUrl}\n` : ""}
${unsubscribeUrl ? `No quiero recibir estos recordatorios: ${unsubscribeUrl}` : ""}`;
  return { subject: `Tu carrito te espera — ${store}`, html, text };
};

// ---- Lealtad (Fase 4.1, modules/loyalty.js) ----
const loyaltyRewardEmailTemplate = ({ branding, name, reward, goal }) => {
  const store = branding.storeName || "Duck-Hack";
  const { html, text } = accountActionEmailTemplate({
    ...branding,
    title: "¡Completaste tu tarjeta!",
    name,
    intro: `Juntaste ${goal} sellos en ${store}. Tu beneficio ya está listo:`,
    details: [{ label: "Beneficio", value: reward }],
    note: "Pídelo en tu próxima visita; lo aplicamos en el momento.",
    footnote: `Gracias por tu preferencia — ${store}`,
  });
  return { subject: `¡Completaste tu tarjeta! — ${store}`, html, text };
};

// kind: "warning" (vencen pronto) | "expired" (ya vencieron).
const loyaltyExpiryEmailTemplate = ({ kind, branding, name, points, expiresOn, shopUrl }) => {
  const store = branding.storeName || "Duck-Hack";
  const amount = formatCurrency(points);
  const warning = kind === "warning";
  const { html, text } = accountActionEmailTemplate({
    ...branding,
    title: warning ? "Tus puntos están por vencer" : "Tus puntos vencieron",
    name,
    intro: warning
      ? `Tienes ${amount} en puntos en ${store} y vencen el ${expiresOn}. Úsalos en tu próxima compra.`
      : `Tus ${amount} en puntos de ${store} vencieron por falta de movimiento. ¡Con tu próxima compra empiezas a juntar de nuevo!`,
    ctaLabel: warning ? "Ir a la tienda" : undefined,
    url: warning ? shopUrl || undefined : undefined,
    footnote: `Puntos de lealtad — ${store}`,
  });
  return { subject: warning ? `Tus puntos vencen pronto — ${store}` : `Tus puntos vencieron — ${store}`, html, text };
};


// ---- Tarjetas de regalo (Fase 5.2, modules/giftCards.js) ----
// card: { number, code, amount, balance, buyerName, recipientName, message };
// `expiresText` ya formateado; `spei` = storeSpeiAccount; `pageUrl` = la
// página de la compra (FRONTEND_URL/tarjeta-regalo/<id>?token=…).
const giftCardDetails = (card, expiresText) =>
  [
    { label: "Código", value: card.code },
    { label: "Saldo", value: formatCurrency(card.balance ?? card.amount) },
    expiresText ? { label: "Vigencia", value: `Hasta el ${expiresText}` } : { label: "Vigencia", value: "Sin vencimiento" },
    card.buyerName ? { label: "De parte de", value: card.buyerName } : null,
    card.message ? { label: "Mensaje", value: card.message } : null,
  ].filter(Boolean);

const giftCardEmailTemplate = ({ kind, card, branding, expiresText, pageUrl, spei, reason, shopUrl }) => {
  const store = branding.storeName || "Duck-Hack";
  const base = { ...branding };
  if (kind === "pending_payment") {
    const details = [
      { label: "Folio", value: `#${card.number}` },
      { label: "Monto", value: formatCurrency(card.amount) },
      { label: "Para", value: card.recipientName || card.buyerName },
      ...(spei
        ? [
            spei.accountHolderName ? { label: "Beneficiario", value: spei.accountHolderName } : null,
            spei.bank ? { label: "Banco", value: spei.bank } : null,
            { label: "CLABE", value: spei.clabe },
          ].filter(Boolean)
        : []),
      { label: "Concepto", value: `Tarjeta ${card.number}` },
    ];
    const { html, text } = accountActionEmailTemplate({
      ...base,
      title: "Tu tarjeta de regalo está apartada",
      name: card.buyerName,
      intro: `Gracias por regalar ${store}. Para activarla, transfiere el monto y sube tu comprobante; en cuanto lo validemos enviamos la tarjeta.`,
      details,
      ctaLabel: pageUrl ? "Subir mi comprobante" : undefined,
      url: pageUrl || undefined,
      note: pageUrl ? undefined : "Cuando transfieras, responde este correo con tu comprobante.",
      footnote: `${store}`,
    });
    return { subject: `Tarjeta de regalo #${card.number}: falta tu pago — ${store}`, html, text };
  }
  if (kind === "delivered") {
    const { html, text } = accountActionEmailTemplate({
      ...base,
      title: "¡Te regalaron una tarjeta!",
      name: card.recipientName,
      intro: `${card.buyerName || "Alguien especial"} te regala ${formatCurrency(card.amount)} para usar en ${store}.`,
      details: giftCardDetails(card, expiresText),
      ctaLabel: shopUrl ? `Visitar ${store}` : undefined,
      url: shopUrl || undefined,
      note: "Úsala en la tienda en línea (escribe el código al pagar) o en el salón al cobrar tu cita. Se puede usar en partes hasta agotar el saldo.",
      footnote: "Adjuntamos tu tarjeta en PDF por si quieres imprimirla.",
    });
    return { subject: `Tienes una tarjeta de regalo de ${formatCurrency(card.amount)} — ${store}`, html, text };
  }
  if (kind === "buyer_copy") {
    const sentTo = card.recipientEmail && card.recipientEmail !== card.buyerEmail;
    const { html, text } = accountActionEmailTemplate({
      ...base,
      title: "Tu tarjeta de regalo está lista",
      name: card.buyerName,
      intro: sentTo
        ? `Confirmamos tu pago y enviamos la tarjeta a ${card.recipientName} (${card.recipientEmail}).`
        : "Confirmamos tu pago. Aquí está la tarjeta para que la entregues:",
      details: giftCardDetails(card, expiresText),
      footnote: "Adjuntamos la tarjeta en PDF.",
    });
    return { subject: `Tarjeta de regalo #${card.number} activa — ${store}`, html, text };
  }
  if (kind === "proof_rejected") {
    const { html, text } = accountActionEmailTemplate({
      ...base,
      title: "No pudimos validar tu pago",
      name: card.buyerName,
      intro: "Revisamos el comprobante de tu tarjeta de regalo y no pudimos validarlo:",
      details: [
        { label: "Folio", value: `#${card.number}` },
        { label: "Monto", value: formatCurrency(card.amount) },
      ],
      note: reason ? `Motivo: ${reason}` : undefined,
      ctaLabel: pageUrl ? "Subir otro comprobante" : undefined,
      url: pageUrl || undefined,
      footnote: `${store}`,
    });
    return { subject: `Revisa el pago de tu tarjeta de regalo — ${store}`, html, text };
  }
  // business_proof: aviso al negocio.
  const { html, text } = accountActionEmailTemplate({
    ...base,
    title: kind === "business_new" ? "Nueva tarjeta de regalo por pagar" : "Llegó un comprobante de tarjeta de regalo",
    intro: kind === "business_new" ? "Se pidió una tarjeta de regalo desde el sitio:" : "Revísalo en el panel para activar la tarjeta:",
    details: [
      { label: "Folio", value: `#${card.number}` },
      { label: "Monto", value: formatCurrency(card.amount) },
      { label: "Compra", value: `${card.buyerName} (${card.buyerEmail})` },
      { label: "Para", value: card.recipientName || card.buyerName },
    ],
    ctaLabel: pageUrl ? "Abrir en el panel" : undefined,
    url: pageUrl || undefined,
    footnote: "Aviso automático de tarjetas de regalo.",
  });
  return { subject: `${kind === "business_new" ? "Nueva tarjeta de regalo" : "Comprobante de tarjeta"} #${card.number} — ${card.buyerName}`, html, text };
};

module.exports = {
  giftCardEmailTemplate,
  wishlistBackInStockEmailTemplate,
  appointmentReviewRequestEmailTemplate,
  loyaltyRewardEmailTemplate,
  loyaltyExpiryEmailTemplate,
  abandonedCartEmailTemplate,
  appointmentEmailTemplate,
  appointmentBusinessEmailTemplate,
  resolveSpeiAccount,
  storeSpeiAccount,
  paymentTypeOf,
  lowStockEmailTemplate,
  orderStatusEmailTemplate,
  verificationEmailTemplate,
  passwordResetEmailTemplate,
  orderConfirmationEmailTemplate,
  orderNotificationEmailTemplate,
};
