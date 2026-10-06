// Pedidos. Roadmap eCommerce (ver frontend-admin/src/components/AdminMenu.jsx).
// Dos formas de crear un pedido:
//   - POST /  (staff, canWrite) — venta manual desde el panel (telefónica,
//     mostrador, etc.); de ahí que siempre se pidan datos de contacto en texto
//     plano además de un `customer` opcional, en vez de exigir cuenta de usuario.
//   - POST /public (sin auth, rate-limited) — checkout real del storefront
//     (frontend-user). Mismo patrón que modules/mail.js: router público +
//     createRateLimiter importado directo (no viene por ctx). Sin pasarela de
//     pago: el pedido entra "pending" y la tienda confirma el pago a mano
//     (ver deliveryMethod / paymentMethod y lib/checkoutOptions.js). Envía correo de confirmación al cliente y aviso a
//     la tienda — best-effort, un fallo de correo no tumba el pedido ya creado.
//     Sigue sin EXIGIR sesión (el invitado sigue pudiendo comprar), pero si el
//     comprador inició sesión/se registró durante el checkout y el frontend
//     manda su token, el pedido queda vinculado a esa cuenta — ver
//     attachOptionalCustomer más abajo.
const express = require("express");
const mongoose = require("mongoose");
const { PassThrough } = require("stream");
const {
  sanitizeDoc,
  handleMongooseError,
  asFiniteNumber,
  asTrimmedString,
  isValidObjectId,
  getOrCreateModel,
} = require("../lib/moduleHelpers");
const { createRateLimiter } = require("../lib/rateLimit");
const { parseMxPhone } = require("../lib/phone");
const { settleCartAfterOrder } = require("./cart");
const { round2: roundMoney, isProgramActive, getLoyaltySettings, reservePoints, syncOrderLoyalty } = require("../lib/loyalty");
const { getPurchaseLimit } = require("../lib/purchaseLimits");
const { shippingSettingsOf, computeShippingCost } = require("../lib/shipping");
const { DELIVERY_METHODS, resolveCheckout } = require("../lib/checkoutOptions");
const { sendMail } = require("../lib/mailer");
const { verifyAccessToken, signOrderAccessToken, verifyOrderAccessToken } = require("../lib/jwt");
const { extractBearerToken, ROLES: AUTH_ROLES } = require("../lib/authMiddleware");
const {
  orderConfirmationEmailTemplate,
  orderNotificationEmailTemplate,
  orderStatusEmailTemplate,
  resolveSpeiAccount,
  paymentTypeOf,
} = require("../lib/emailTemplates");
const { createPaymentProofUploadMiddlewares } = require("../lib/uploads");
const { paymentProofSchema, proofRecordFrom, findProof, streamProofFile, discardProofFile } = require("../lib/paymentProofs");
const { createModuleAuthorizer } = require("../lib/permissions");
const { recalculateStatus, notifyStockAlerts } = require("./inventory");
const { resolveCoupon, reserveCouponUse, syncCouponUse } = require("../lib/coupons");
const { findUsableCard, debitCard, creditCard, syncOrderGiftCard } = require("../lib/giftCards");
const { hasVariants, findVariant, variantLabel, variantPricing, stockKey } = require("../lib/variants");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// payment_review = el cliente (o la tienda) subió un comprobante y falta
// validarlo en el panel (POST /:id/payment-proofs/:proofId/review). El final
// depende de la entrega:
//   envío a domicilio: … → processing → shipped → delivered
//   recoger en tienda: … → processing → ready_for_pickup → picked_up
// (pending → payment_review → confirmed → processing es común; cancelled en
// cualquier momento). Un pedido solo acepta los estados de su entrega
// (statusesFor), así uno para recoger nunca queda "Enviado".
const ORDER_STATUSES = [
  "pending", "payment_review", "confirmed", "processing",
  "shipped", "delivered", "ready_for_pickup", "picked_up", "cancelled",
];
const SHIPPING_ONLY_STATUSES = ["shipped", "delivered"];
const PICKUP_ONLY_STATUSES = ["ready_for_pickup", "picked_up"];
const statusesFor = (deliveryMethod) => {
  const exclude = deliveryMethod === "pickup" ? SHIPPING_ONLY_STATUSES : PICKUP_ONLY_STATUSES;
  return ORDER_STATUSES.filter((s) => !exclude.includes(s));
};
// Solo se aceptan comprobantes mientras el pedido espera su pago.
const AWAITING_PAYMENT_STATUSES = ["pending", "payment_review"];
// Estados en los que lo vendido ya salió del inventario: del pago en
// adelante, sea cual sea el camino (un pedido "pago al recoger" puede saltar
// de pending a ready_for_pickup sin pasar por confirmed). Ver
// syncInventoryForOrder.
const DEDUCTED_STATUSES = ["confirmed", "processing", "shipped", "delivered", "ready_for_pickup", "picked_up"];
const MAX_PAYMENT_PROOFS = 10;

// Mismo set de campos que User.addresses en modules/auth.js — así una
// dirección de la libreta se copia tal cual al pedido (ver Cart.jsx en
// frontend-user). `interiorNumber` es el único opcional; los demás solo se
// exigen con envío a domicilio (deliveryMethod "shipping", ver POST /public).
const SHIPPING_ADDRESS_REQUIRED_FIELDS = [
  "recipientName",
  "phone",
  "street",
  "exteriorNumber",
  "zipCode",
  "neighborhood",
  "city",
  "state",
];
const SHIPPING_ADDRESS_FIELDS = [...SHIPPING_ADDRESS_REQUIRED_FIELDS, "interiorNumber"];

// Copia del punto de venta elegido para recoger (StoreConfig.pickupPoints),
// tal como estaba al hacer el pedido.
const pickupPointSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 400 },
    schedule: { type: String, trim: true, maxlength: 200 },
    instructions: { type: String, trim: true, maxlength: 500 },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: { type: String, trim: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 40 },
    street: { type: String, trim: true, maxlength: 200 },
    exteriorNumber: { type: String, trim: true, maxlength: 20 },
    interiorNumber: { type: String, trim: true, maxlength: 20 },
    zipCode: { type: String, trim: true, maxlength: 10 },
    neighborhood: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 120 },
    state: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false }
);

// Usado por validateCreatePayload y validateUpdatePayload — recorta cada
// campo del objeto que mande el cliente, ignorando cualquier otra llave.
const normalizeShippingAddress = (raw) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const normalized = {};
  for (const field of SHIPPING_ADDRESS_FIELDS) {
    if (source[field] !== undefined) normalized[field] = asTrimmedString(source[field]);
  }
  return normalized;
};

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // Snapshot de nombre/precio al momento de crear el pedido — si el
    // producto cambia de precio después, el pedido ya hecho no se mueve
    // (mismo criterio que Invoice.items, ver backend/models/invoice.model.js).
    productName: { type: String, required: true, trim: true },
    // Variante elegida (Product.variants._id) + snapshot legible
    // ("Talla: M / Color: Rojo"); ausentes en productos sin variantes.
    variant: { type: mongoose.Schema.Types.ObjectId },
    variantLabel: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    // Snapshot de Product.compareAtPrice SOLO cuando representaba un
    // descuento real al momento de la compra (compareAtPrice > price) —
    // mismo criterio de snapshot que productName/unitPrice: si el producto
    // cambia de precio después, el pedido ya hecho no se mueve. Ausente
    // (undefined) = sin descuento, ver renderOrderItemRowHtml en
    // lib/emailTemplates.js y orderPdf.js.
    compareAtPrice: { type: Number, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// Envío con paquetería: lo captura la tienda en el panel (PUT /:id). Las
// fechas se ponen solas al pasar a shipped / delivered.
const shipmentSchema = new mongoose.Schema(
  {
    carrier: { type: String, trim: true, maxlength: 80 },
    trackingNumber: { type: String, trim: true, maxlength: 120 },
    trackingUrl: { type: String, trim: true, maxlength: 500 },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true, maxlength: 200 },
    customerEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    customerPhone: { type: String, trim: true, maxlength: 40 },
    // Opcional a propósito: la venta manual de staff (POST /) casi nunca
    // tiene cuenta de por medio, y el checkout público (POST /public) solo lo
    // llena cuando attachOptionalCustomer verifica un JWT de customer válido
    // — nunca se acepta este id directamente del payload (ver
    // validateCheckoutExtras), para que nadie se adjudique el pedido de otra
    // cuenta con solo mandar su id.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "El pedido debe tener al menos un artículo.",
      },
    },
    status: { type: String, enum: ORDER_STATUSES, default: "pending" },
    // Envío cobrado, calculado server-side en POST /public con
    // StoreConfig.shipping (lib/shipping.js) — 0 si la tienda no cobra envío,
    // si se alcanzó el envío gratis, en "pickup" y en ventas manuales de staff.
    shippingCost: { type: Number, min: 0, default: 0 },
    // Calculado server-side = suma de items[].subtotal + shippingCost, nunca
    // aceptado del cliente — mismo criterio que Invoice.amount
    // (backend/routes/invoices.routes.js).
    total: { type: Number, required: true, min: 0 },
    shippingAddress: { type: shippingAddressSchema },
    notes: { type: String, trim: true, maxlength: 1000 },
    // Entrega: "shipping" (a domicilio, con shippingAddress) o "pickup"
    // (recoge en pickupPoint, copia del punto elegido; puede faltar en pedidos
    // de antes de configurar puntos de venta).
    deliveryMethod: { type: String, enum: DELIVERY_METHODS, default: "shipping" },
    pickupPoint: { type: pickupPointSnapshotSchema },
    // Método de pago elegido (id de StoreConfig.paymentMethods, ver
    // lib/checkoutOptions.js) + copia de su tipo, nombre e instrucciones al
    // momento del pedido. Sin pasarela todavía: el pedido entra "pending" y
    // la tienda confirma el pago a mano. Pedidos anteriores guardan
    // "transfer" / "pickup" sin copia (las etiquetas salen de
    // PAYMENT_METHOD_LABELS en correos, PDF y admin).
    paymentMethod: { type: String, trim: true, maxlength: 64, default: "transfer" },
    paymentMethodType: { type: String, trim: true, maxlength: 40 },
    paymentMethodLabel: { type: String, trim: true, maxlength: 80 },
    paymentInstructions: { type: String, trim: true, maxlength: 1000 },
    // Folio legible para soporte/correos — no confundir con _id. Sin `unique`
    // a propósito: con el volumen de pedidos de esta tienda un choque por
    // concurrencia es despreciable (ver nextOrderNumber más abajo) y un
    // duplicado raro no rompe nada.
    orderNumber: { type: Number, index: true },
    // Comprobantes de pago (lib/paymentProofs.js), en orden de subida.
    paymentProofs: { type: [paymentProofSchema], default: [] },
    shipment: { type: shipmentSchema },
    // Recoger en tienda: se ponen solas al pasar a ready_for_pickup / picked_up.
    readyForPickupAt: { type: Date },
    pickedUpAt: { type: Date },
    // Cupón aplicado en el checkout (lib/coupons.js). `amount` = lo que se
    // descontó del subtotal de productos; en free_shipping es 0 y el envío
    // queda en $0. `counted` = el pedido cuenta como uso del cupón (no si se
    // cancela); lo maneja syncCouponUse.
    // Tarjeta de regalo (lib/giftCards.js, Fase 5.2): lo que se pagó con ella
    // (también cubre el envío). `refunded` = el saldo se regresó a la tarjeta
    // porque el pedido se canceló o se borró (syncOrderGiftCard).
    giftCard: {
      type: new mongoose.Schema(
        {
          card: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCard", required: true },
          code: { type: String, trim: true },
          amount: { type: Number, min: 0, default: 0 },
          refunded: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // Lealtad (lib/loyalty.js): puntos ganados al pagarse y puntos usados en
    // el checkout. Las marcas earnedCounted / redeemRefunded cambian de forma
    // atómica (nunca abona ni devuelve dos veces). Solo lo escribe el servidor.
    loyalty: {
      type: new mongoose.Schema(
        {
          customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          earned: { type: Number, min: 0, default: 0 },
          earnedCounted: { type: Boolean, default: false },
          redeemed: { type: Number, min: 0, default: 0 },
          redeemRefunded: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: undefined,
    },
    discount: {
      type: new mongoose.Schema(
        {
          code: { type: String, trim: true },
          coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
          type: { type: String, trim: true },
          value: { type: Number, min: 0 },
          amount: { type: Number, min: 0, default: 0 },
          counted: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // true = lo vendido ya se descontó del inventario. Lo maneja solo
    // syncInventoryForOrder (nunca se acepta del cliente); antes se deducía de
    // si el estado era "confirmed", y el stock regresaba al avanzar a
    // processing/shipped.
    inventoryDeducted: { type: Boolean, default: false },
  },
  { timestamps: true }
);
orderSchema.index({ status: 1 });
orderSchema.index({ customer: 1 });

// Dirección normalizada en req.body; el teléfono (si viene) a 10 dígitos
// (lib/phone.js). Devuelve el mensaje de error o null.
const applyShippingAddress = (req, rawAddress) => {
  const address = normalizeShippingAddress(rawAddress);
  if (address && address.phone) {
    const phone = parseMxPhone(address.phone, { label: "El teléfono de la dirección de envío" });
    if (phone.error) return phone.error;
    address.phone = phone.value;
  }
  req.body.shippingAddress = address;
  return null;
};

const validateCreatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};

  const customerName = asTrimmedString(payload.customerName);
  if (!customerName) return sendError(res, 400, "VALIDATION_ERROR", "customerName es requerido.");
  req.body.customerName = customerName;

  const customerEmail = asTrimmedString(payload.customerEmail).toLowerCase();
  if (!EMAIL_REGEX.test(customerEmail)) {
    return sendError(res, 400, "VALIDATION_ERROR", "customerEmail es requerido y debe ser un correo válido.");
  }
  req.body.customerEmail = customerEmail;

  if (payload.customerPhone !== undefined) {
    const phone = parseMxPhone(payload.customerPhone, { label: "El teléfono del cliente" });
    if (phone.error) return sendError(res, 400, "VALIDATION_ERROR", phone.error);
    req.body.customerPhone = phone.value;
  }
  if (payload.shippingAddress !== undefined) {
    const addressError = applyShippingAddress(req, payload.shippingAddress);
    if (addressError) return sendError(res, 400, "VALIDATION_ERROR", addressError);
  }
  if (payload.notes !== undefined) req.body.notes = asTrimmedString(payload.notes);

  if (payload.customer !== undefined && payload.customer !== "") {
    if (!isValidObjectId(payload.customer)) {
      return sendError(res, 400, "VALIDATION_ERROR", "customer debe ser un id válido.");
    }
    req.body.customer = payload.customer;
  } else {
    delete req.body.customer;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return sendError(res, 400, "VALIDATION_ERROR", "items es requerido (al menos un artículo).");

  const normalizedItems = [];
  for (const item of items) {
    if (!isValidObjectId(item?.product)) {
      return sendError(res, 400, "VALIDATION_ERROR", "Cada item requiere un product válido.");
    }
    const quantity = asFiniteNumber(item.quantity);
    if (quantity === null || quantity < 1) {
      return sendError(res, 400, "VALIDATION_ERROR", "Cada item requiere quantity >= 1.");
    }
    const normalized = { product: item.product, quantity };
    if (item.variant !== undefined && item.variant !== null && item.variant !== "") {
      if (!isValidObjectId(item.variant)) {
        return sendError(res, 400, "VALIDATION_ERROR", "variant debe ser un id válido.");
      }
      normalized.variant = item.variant;
    }
    normalizedItems.push(normalized);
  }
  req.body.items = normalizedItems;

  // status/total/shippingCost/productName/unitPrice/subtotal se calculan en
  // el handler, nunca se aceptan del cliente — tampoco lo que solo pone el
  // servidor después (inventario, comprobantes, guía, fechas de recoger).
  for (const field of [
    "status", "total", "shippingCost", "inventoryDeducted", "paymentProofs",
    "shipment", "readyForPickupAt", "pickedUpAt", "discount", "loyalty",
  ]) {
    delete req.body[field];
  }

  return next();
};

const validateUpdatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};

  if (payload.status !== undefined) {
    const status = asTrimmedString(payload.status);
    if (!ORDER_STATUSES.includes(status)) {
      return sendError(res, 400, "VALIDATION_ERROR", `status debe ser uno de: ${ORDER_STATUSES.join(", ")}.`);
    }
    req.body.status = status;
  }
  if (payload.shippingAddress !== undefined) {
    const addressError = applyShippingAddress(req, payload.shippingAddress);
    if (addressError) return sendError(res, 400, "VALIDATION_ERROR", addressError);
  }
  if (payload.notes !== undefined) req.body.notes = asTrimmedString(payload.notes);
  if (payload.shipment !== undefined) {
    const shipment = payload.shipment;
    if (typeof shipment !== "object" || shipment === null || Array.isArray(shipment)) {
      return sendError(res, 400, "VALIDATION_ERROR", "shipment debe ser un objeto.");
    }
    const trackingUrl = asTrimmedString(shipment.trackingUrl);
    if (trackingUrl && !/^https?:\/\/\S+$/i.test(trackingUrl)) {
      return sendError(res, 400, "VALIDATION_ERROR", "shipment.trackingUrl debe ser una URL http(s).");
    }
    // Solo los datos de la guía; las fechas las pone el servidor.
    req.body.shipment = {
      carrier: asTrimmedString(shipment.carrier).slice(0, 80),
      trackingNumber: asTrimmedString(shipment.trackingNumber).slice(0, 120),
      trackingUrl: trackingUrl.slice(0, 500),
    };
  }

  // items/customer/total/shippingCost no se reabren después de creado — ver plan.
  delete req.body.items;
  delete req.body.total;
  delete req.body.shippingCost;
  delete req.body.customer;
  delete req.body.customerName;
  delete req.body.customerEmail;
  delete req.body.customerPhone;

  return next();
};

// Solo para POST /public, encadenado DESPUÉS de validateCreatePayload.
// Normaliza deliveryMethod / pickupPointId / paymentMethod (se validan contra
// StoreConfig en el handler, ver resolveCheckout). También bloquea
// que un checkout anónimo se adjudique un
// `customer` o un `orderNumber` arbitrarios enviados en el payload —
// orderNumber siempre lo pone el servidor, y `customer` SOLO puede venir de
// un JWT verificado (ver attachOptionalCustomer/req.checkoutCustomerId), nunca
// de lo que mande el cliente en el body — si no, cualquiera podría adjudicarse
// el pedido a la cuenta de otra persona con solo mandar su id.
const validateCheckoutExtras = (sendError) => (req, res, next) => {
  const payload = req.body || {};

  req.body.paymentMethod = payload.paymentMethod ? asTrimmedString(payload.paymentMethod).slice(0, 64) : "transfer";
  req.body.deliveryMethod = payload.deliveryMethod ? asTrimmedString(payload.deliveryMethod) : undefined;
  req.body.pickupPointId = payload.pickupPointId ? asTrimmedString(payload.pickupPointId) : undefined;
  req.body.couponCode = payload.couponCode ? asTrimmedString(payload.couponCode).slice(0, 40) : undefined;
  req.body.giftCardCode = payload.giftCardCode ? asTrimmedString(payload.giftCardCode).slice(0, 40) : undefined;
  delete req.body.giftCard;
  // Puntos de lealtad a usar (pesos). Se valida contra el saldo en el handler.
  if (payload.usePoints !== undefined && payload.usePoints !== null && payload.usePoints !== "" && Number(payload.usePoints) !== 0) {
    const usePoints = asFiniteNumber(payload.usePoints);
    if (usePoints === null || usePoints < 0) return sendError(res, 400, "VALIDATION_ERROR", "usePoints debe ser un número mayor a 0.");
    req.body.usePoints = Math.round(usePoints * 100) / 100;
  } else {
    delete req.body.usePoints;
  }

  // Siempre los calcula el servidor (resolveCheckout).
  delete req.body.pickupPoint;
  delete req.body.paymentMethodType;
  delete req.body.paymentMethodLabel;
  delete req.body.paymentInstructions;
  delete req.body.customer;
  delete req.body.orderNumber;

  return next();
};

// Token Bearer OPCIONAL en el checkout público: si viene y es un access token
// válido de un customer, vincula el pedido a esa cuenta (req.checkoutCustomerId).
// Si no viene, está vencido, es inválido o es de un rol que no es customer
// (p.ej. un token de staff mandado por error), el checkout sigue igual que
// siempre — como invitado — nunca responde error por esto.
const attachOptionalCustomer = (req, res, next) => {
  const token = extractBearerToken(req.header("Authorization"));
  if (token) {
    try {
      const decoded = verifyAccessToken(token);
      if (decoded.role === AUTH_ROLES.CUSTOMER) {
        req.checkoutCustomerId = decoded.id;
      }
    } catch {
      // Token inválido/expirado — seguimos como invitado, no rompemos el checkout.
    }
  }
  return next();
};

// Precios SIEMPRE desde la BD, nunca del payload — usado por POST / y
// POST /public. `requireActive: true` (checkout público) rechaza productos
// dados de baja; `requireActive: false` (venta manual de staff) los permite,
// igual que el comportamiento actual de POST /. No lanza: devuelve
// { error: {status, code, message} } para que el caller responda con
// sendError sin mezclarlo con errores de Mongoose.
const buildOrderItems = async (Product, requestedItems, { requireActive }) => {
  const products = await Product.find({ _id: { $in: requestedItems.map((i) => i.product) } });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  for (const item of requestedItems) {
    const product = productsById.get(String(item.product));
    if (!product) {
      return { error: { status: 404, code: "PRODUCT_NOT_FOUND", message: `El producto ${item.product} no existe.` } };
    }
    if (requireActive && product.isActive === false) {
      return {
        error: {
          status: 400,
          code: "PRODUCT_UNAVAILABLE",
          message: `El producto "${product.name}" ya no está disponible.`,
        },
      };
    }
    // Con variantes, la variante es obligatoria y manda el precio
    // (lib/variants.js#variantPricing); sin variantes no se acepta una.
    let variant = null;
    if (hasVariants(product)) {
      if (!item.variant) {
        return {
          error: {
            status: 400,
            code: "VARIANT_REQUIRED",
            message: `Elige ${product.options.map((o) => o.name.toLowerCase()).join(" / ")} de "${product.name}".`,
          },
        };
      }
      variant = findVariant(product, item.variant);
      if (!variant) {
        return { error: { status: 404, code: "VARIANT_NOT_FOUND", message: `La opción elegida de "${product.name}" ya no existe.` } };
      }
      if (requireActive && variant.isActive === false) {
        return {
          error: {
            status: 400,
            code: "PRODUCT_UNAVAILABLE",
            message: `"${product.name}" (${variantLabel(product, variant)}) ya no está disponible.`,
          },
        };
      }
    } else if (item.variant) {
      return { error: { status: 400, code: "VARIANT_NOT_FOUND", message: `"${product.name}" no tiene variantes.` } };
    }

    const { price, compareAtPrice } = variant ? variantPricing(product, variant) : product;
    const subtotal = price * item.quantity;
    const hasDiscount = compareAtPrice && compareAtPrice > price;
    items.push({
      product: product._id,
      productName: product.name,
      ...(variant ? { variant: variant._id, variantLabel: variantLabel(product, variant) } : {}),
      quantity: item.quantity,
      unitPrice: price,
      ...(hasDiscount ? { compareAtPrice } : {}),
      subtotal,
    });
  }
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  return { items, total };
};

// Checkout público: por producto (sumando sus renglones y sus variantes — el
// mismo café en dos presentaciones cuenta junto) no se pueden pedir más
// unidades que el tope de la tienda (`purchaseLimit`, lib/purchaseLimits.js;
// null = sin tope); y por producto + variante, no más de las que hay en
// inventario.
// Mismo criterio que GET /api/products/public#maxQty, que es lo que el
// storefront ya limita; esto es la red por si llega un payload a mano o el
// inventario bajó mientras el cliente tenía la canasta abierta. Solo lee el
// inventario — se descuenta cuando el pedido pasa a pagado o a un estado
// posterior (syncInventoryForOrder).
const checkPublicQuantities = async (Inventory, items, purchaseLimit) => {
  const units = new Map();
  const stockUnits = new Map();
  for (const item of items) {
    const id = String(item.product);
    const current = units.get(id) || { name: item.productName, quantity: 0 };
    current.quantity += item.quantity;
    units.set(id, current);

    const key = stockKey(item.product, item.variant);
    const name = item.variantLabel ? `${item.productName} (${item.variantLabel})` : item.productName;
    const stockLine = stockUnits.get(key) || { name, quantity: 0 };
    stockLine.quantity += item.quantity;
    stockUnits.set(key, stockLine);
  }

  for (const { name, quantity } of units.values()) {
    if (purchaseLimit && quantity > purchaseLimit) {
      return {
        status: 400,
        code: "PURCHASE_LIMIT_EXCEEDED",
        message: `Máximo ${purchaseLimit} unidades de "${name}" por pedido. Para cantidades mayores contáctanos como cliente mayorista.`,
      };
    }
  }

  const stock = Inventory
    ? await Inventory.find({ product: { $in: [...units.keys()] } }).select("product variant quantity").lean()
    : [];
  const stockByKey = new Map(stock.map((i) => [stockKey(i.product, i.variant), i.quantity]));
  for (const [key, { name, quantity }] of stockUnits) {
    const available = stockByKey.get(key) || 0;
    if (quantity > available) {
      return {
        status: 409,
        code: "INSUFFICIENT_STOCK",
        message: available > 0
          ? `Solo quedan ${available} unidades de "${name}".`
          : `"${name}" se agotó.`,
      };
    }
  }
  return null;
};

// Folio legible siguiente — mismo criterio "leer el máximo + 1" que
// backend/utils/accountingHooks.js#getNextInvoiceFolio (ver nota en el schema
// sobre por qué no hace falta un contador atómico aquí).
const nextOrderNumber = async (Order) => {
  const last = await Order.findOne().sort({ orderNumber: -1 }).select("orderNumber").lean();
  return (last?.orderNumber || 0) + 1;
};

// Junta el PDF del pedido en memoria (Buffer) para adjuntarlo al correo del
// cliente — mismo generateOrderPdf que usa GET /:id/pdf (ver más abajo), solo
// que ahí escribe directo a la respuesta HTTP y aquí a un stream intermedio
// que se puede convertir a Buffer sin tocar orderPdf.js.
const renderOrderPdfBuffer = (order, storeConfig, generateOrderPdf) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const passthrough = new PassThrough();
    passthrough.on("data", (chunk) => chunks.push(chunk));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);
    try {
      generateOrderPdf(order, storeConfig, passthrough);
    } catch (error) {
      reject(error);
    }
  });

// Enlace a la página del pedido en el storefront, donde el cliente (invitado
// o con cuenta) ve su pedido y sube el comprobante de pago:
// FRONTEND_URL/pedido/<id>?token=<orderAccessToken>. Contrato con cada
// storefront (release-*): esa ruta debe existir y leer GET /:id/summary con
// el token en X-Order-Token. null si la tienda no lo activó
// (StoreConfig.customerProofUpload) o falta FRONTEND_URL.
const ORDER_PAGE_PATH = "/pedido";
const customerOrderUrl = (order, storeConfig) => {
  if (!storeConfig?.customerProofUpload) return null;
  const base = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const token = signOrderAccessToken({ orderId: order._id });
  return `${base}${ORDER_PAGE_PATH}/${order._id}?token=${encodeURIComponent(token)}`;
};

// Correo al cliente (con formato/marca de la tienda, detalle de productos
// con descuento, datos de pago SPEI de la tienda, y el ticket en PDF
// adjunto) + aviso interno a la tienda cuando entra un pedido del
// storefront. Se llama sin `await` desde el handler (fire-and-forget con su
// propio catch) para no retrasar la respuesta 201 ni tumbar el pedido si el
// mailer o la generación del PDF fallan.
const sendCheckoutEmails = async (order, { mongooseConnection, generateOrderPdf }) => {
  const StoreConfig = mongooseConnection.models.StoreConfig;
  const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;

  const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
  const logoAbsoluteUrl = backendPublicUrl && storeConfig?.logoUrl
    ? `${backendPublicUrl}/${String(storeConfig.logoUrl).replace(/^\/+/, "")}`
    : undefined;

  // Solo pide el comprobante si el pago es por transferencia.
  const proofUploadUrl = paymentTypeOf(order) === "spei" ? customerOrderUrl(order, storeConfig) : null;
  const { html, text } = orderConfirmationEmailTemplate({ order, storeConfig, logoAbsoluteUrl, proofUploadUrl });

  let attachments;
  if (generateOrderPdf) {
    try {
      const pdfBuffer = await renderOrderPdfBuffer(order, storeConfig, generateOrderPdf);
      attachments = [{ filename: `pedido-${order.orderNumber ?? order._id}.pdf`, content: pdfBuffer, contentType: "application/pdf" }];
    } catch (error) {
      // El ticket es un extra del correo, no el motivo de enviarlo — si
      // falla la generación del PDF, el correo se manda igual sin adjunto.
      console.error("No fue posible generar el PDF del pedido para el correo:", error.message);
    }
  }

  await sendMail({
    to: order.customerEmail,
    subject: `Pedido #${order.orderNumber} recibido`,
    text,
    html,
    attachments,
  });

  const storeTo = process.env.CONTACT_EMAIL_TO || process.env.EMAIL_USER;
  if (!storeTo) return;
  const notification = orderNotificationEmailTemplate({ order, storeConfig, logoAbsoluteUrl });
  await sendMail({
    to: storeTo,
    subject: `Nuevo pedido #${order.orderNumber} — ${order.customerName}`,
    text: notification.text,
    html: notification.html,
  });
};

// Aviso por correo de un cambio del pedido (lib/emailTemplates.js
// #orderStatusEmailTemplate). `kind` = confirmed | proof_rejected | shipped |
// delivered | ready_for_pickup | picked_up | cancelled (al cliente) o proof_uploaded (a la tienda). Respeta
// StoreConfig.orderNotifications (todo encendido por default). Igual que los
// correos del checkout: best-effort, se llama sin await y nunca tumba la
// respuesta.
const NOTIFICATION_KEY_BY_KIND = {
  confirmed: "confirmed",
  proof_rejected: "proofRejected",
  shipped: "shipped",
  delivered: "delivered",
  ready_for_pickup: "readyForPickup",
  picked_up: "pickedUp",
  cancelled: "cancelled",
  proof_uploaded: "proofUploaded",
};
const sendOrderStatusEmail = async (order, kind, { mongooseConnection, reason } = {}) => {
  const StoreConfig = mongooseConnection.models.StoreConfig;
  const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;
  if (storeConfig?.orderNotifications?.[NOTIFICATION_KEY_BY_KIND[kind]] === false) return;

  const toStore = kind === "proof_uploaded";
  const to = toStore ? process.env.CONTACT_EMAIL_TO || process.env.EMAIL_USER : order.customerEmail;
  if (!to) return;

  const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
  const logoAbsoluteUrl = backendPublicUrl && storeConfig?.logoUrl
    ? `${backendPublicUrl}/${String(storeConfig.logoUrl).replace(/^\/+/, "")}`
    : undefined;
  const proofUploadUrl = kind === "proof_rejected" ? customerOrderUrl(order, storeConfig) : null;
  const { subject, html, text } = orderStatusEmailTemplate({ kind, order, storeConfig, logoAbsoluteUrl, reason, proofUploadUrl });
  await sendMail({ to, subject, text, html });
};

const notifyOrder = (order, kind, deps) => {
  sendOrderStatusEmail(order, kind, deps).catch((error) => {
    console.error(`No fue posible enviar el aviso "${kind}" del pedido ${order.orderNumber ?? order._id}:`, error.message);
  });
};

// Correo al cliente según el estado nuevo (los demás estados no avisan).
const STATUS_NOTIFICATIONS = ["confirmed", "shipped", "delivered", "ready_for_pickup", "picked_up", "cancelled"];

// Ajusta el inventario de cada producto (o variante) del pedido — sign=-1
// descuenta lo vendido, sign=+1 lo regresa. Lo llama syncInventoryForOrder,
// que decide cuándo. Nunca bloquea la actualización del pedido, que ya se
// guardó antes de llamar esto — best-effort: si Inventory no está montado, o
// un producto no tiene registro de inventario, ese renglón simplemente se
// ignora.
const adjustInventoryForOrder = async (mongooseConnection, order, sign) => {
  const Inventory = mongooseConnection.models.Inventory;
  if (!Inventory) return;

  const changes = [];
  for (const item of order.items) {
    try {
      const updated = await Inventory.findOneAndUpdate(
        { product: item.product, variant: item.variant || null },
        { $inc: { quantity: sign * item.quantity } },
        { new: true }
      );
      if (!updated) continue; // producto sin registro de inventario — nada que ajustar

      // Nunca queda en negativo: si varios pedidos se confirmaron con más
      // unidades de las que había, se recorta a 0 en vez de mostrar un stock
      // imposible.
      const clampedQuantity = Math.max(0, updated.quantity);
      const status = recalculateStatus(clampedQuantity, updated.lowStockThreshold || 0);
      const previousStatus = updated.status;
      if (clampedQuantity !== updated.quantity || status !== updated.status) {
        updated.quantity = clampedQuantity;
        updated.status = status;
        await updated.save();
      }
      changes.push({ item: updated, previousStatus });
    } catch (error) {
      console.error(`No fue posible ajustar el inventario del producto ${item.product}:`, error.message);
    }
  }
  // Un solo correo con todo lo que quedó en su mínimo o agotado (sin await:
  // no retrasa la respuesta del pedido).
  notifyStockAlerts(mongooseConnection, changes);
};

// Deja el inventario de acuerdo con el estado del pedido (ya guardado): en
// DEDUCTED_STATUSES lo vendido debe estar descontado; en pending,
// payment_review o cancelled, no. El cambio del marcador inventoryDeducted
// es atómico (updateOne condicionado): si dos peticiones llegan a la vez,
// solo una mueve el stock. `{ release: true }` regresa el stock sin importar
// el estado (al borrar el pedido).
const syncInventoryForOrder = async (Order, mongooseConnection, order, { release = false } = {}) => {
  const shouldBeDeducted = !release && DEDUCTED_STATUSES.includes(order.status);
  const result = await Order.updateOne(
    { _id: order._id, inventoryDeducted: shouldBeDeducted ? { $ne: true } : true },
    { $set: { inventoryDeducted: shouldBeDeducted } }
  );
  if (result.modifiedCount !== 1) return; // ya estaba como debía
  order.inventoryDeducted = shouldBeDeducted;
  await adjustInventoryForOrder(mongooseConnection, order, shouldBeDeducted ? -1 : 1);
};

// Pedidos de antes de inventoryDeducted (el campo no existe en la BD; Mongoose
// lo lee como false por default): con la regla vieja, el stock solo estaba
// descontado si el pedido estaba en "confirmed". Se fija eso ANTES de cambiar
// el estado, para que syncInventoryForOrder no vuelva a descontar lo que ya
// estaba descontado. Así no hace falta correr el script de migración antes
// de usar el backend nuevo (el script queda para listar lo que revisar).
const backfillInventoryFlag = async (Order, order) => {
  if (!order.$isDefault("inventoryDeducted")) return;
  const legacyDeducted = order.status === "confirmed";
  await Order.updateOne({ _id: order._id, inventoryDeducted: { $exists: false } }, { $set: { inventoryDeducted: legacyDeducted } });
  order.inventoryDeducted = legacyDeducted;
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, authorizeRoles, ROLES, STAFF_ROLES, sendError, generateOrderPdf } = ctx;
  const Order = getOrCreateModel(mongooseConnection, "Order", orderSchema);

  const router = express.Router();

  // Permisos por tienda (lib/permissions.js).
  const { authorizeModule, hasModule } = createModuleAuthorizer({ mongooseConnection, sendError });
  const canRead = authorizeModule("orders");
  const canWrite = authorizeModule("orders");

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) {
      return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    }
    return next();
  };

  // ¿El usuario de este access token es dueño del pedido? (cuenta vinculada o
  // mismo correo, igual que GET /mine).
  const isOrderOwner = async (order, userId) => {
    if (order.customer && String(order.customer._id || order.customer) === String(userId)) return true;
    const User = mongooseConnection.models.User;
    const me = User && (await User.findById(userId).select("email"));
    return Boolean(me?.email && me.email === order.customerEmail);
  };

  // Quién está actuando sobre el pedido, para las rutas de comprobantes que
  // aceptan staff, dueño con sesión o invitado con el token del pedido
  // (`X-Order-Token`, lo devuelve POST /public). Deja req.order y
  // req.orderActor = { as: "staff" | "customer", userId? }. Corre ANTES de
  // multer para no escribir archivos de quien no tiene permiso.
  const resolveOrderActor = async (req, res, next) => {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) return sendError(res, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");

      const orderToken = req.header("X-Order-Token");
      if (orderToken) {
        try {
          const decoded = verifyOrderAccessToken(orderToken);
          if (decoded.oid !== String(order._id)) throw new Error("otro pedido");
        } catch {
          return sendError(res, 401, "ORDER_TOKEN_INVALID", "El enlace del pedido no es válido o ya venció.");
        }
        req.order = order;
        req.orderActor = { as: "customer" };
        return next();
      }

      const bearer = extractBearerToken(req.header("Authorization"));
      if (!bearer) return sendError(res, 401, "TOKEN_REQUIRED", "Inicia sesión o usa el enlace de tu pedido.");
      let decoded;
      try {
        decoded = verifyAccessToken(bearer);
      } catch {
        return sendError(res, 401, "TOKEN_INVALID", "Tu sesión no es válida o ya venció.");
      }
      if (STAFF_ROLES.includes(decoded.role) && (await hasModule(decoded.role, "orders"))) {
        req.order = order;
        req.orderActor = { as: "staff", userId: decoded.id };
        return next();
      }
      if (await isOrderOwner(order, decoded.id)) {
        req.order = order;
        req.orderActor = { as: "customer", userId: decoded.id };
        return next();
      }
      return sendError(res, 403, "FORBIDDEN", "No tienes permisos para este pedido.");
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el pedido.");
    }
  };

  // Solo se sube comprobante a un pedido que espera su pago.
  const ensureAwaitingPayment = (req, res, next) => {
    if (!AWAITING_PAYMENT_STATUSES.includes(req.order.status)) {
      return sendError(res, 409, "ORDER_NOT_AWAITING_PAYMENT", "Este pedido ya no está esperando su pago.");
    }
    if ((req.order.paymentProofs || []).length >= MAX_PAYMENT_PROOFS) {
      return sendError(res, 409, "TOO_MANY_PAYMENT_PROOFS", `Este pedido ya tiene ${MAX_PAYMENT_PROOFS} comprobantes; contacta a la tienda.`);
    }
    return next();
  };

  const proofRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    code: "RATE_LIMIT_PAYMENT_PROOF_EXCEEDED",
    message: "Demasiados comprobantes enviados. Intenta de nuevo en unos minutos.",
    sendError,
  });
  const proofUpload = createPaymentProofUploadMiddlewares({ fieldName: "file", sendError });

  // ---- comprobantes de pago: staff, dueño o invitado con X-Order-Token ----
  // Al subirlo, un pedido "pending" pasa a "payment_review" y, si lo subió el
  // cliente, se avisa a la tienda. Multipart con el archivo en `file`
  // (JPG/PNG/PDF, hasta 8 MB).
  router.post(
    "/:id/payment-proof",
    proofRateLimiter,
    validateObjectIdParam("id"),
    resolveOrderActor,
    ensureAwaitingPayment,
    proofUpload.uploadMiddleware,
    proofUpload.sanitizeAndStoreMiddleware,
    async (req, res) => {
      const { order, orderActor } = req;
      try {
        order.paymentProofs.push(proofRecordFrom(req.savedProof, { uploadedBy: orderActor.as, userId: orderActor.userId }));
        if (order.status === "pending") order.status = "payment_review";
        await order.save();
        if (orderActor.as === "customer") notifyOrder(order, "proof_uploaded", { mongooseConnection });

        const proof = order.paymentProofs[order.paymentProofs.length - 1];
        // Al invitado/cliente solo lo necesario; el staff recibe el pedido completo.
        if (orderActor.as === "staff") {
          return res.status(201).json({ message: "Comprobante agregado.", order: sanitizeDoc(order) });
        }
        return res.status(201).json({
          message: "Recibimos tu comprobante. La tienda lo revisará pronto.",
          status: order.status,
          proof: { _id: proof._id, status: proof.status, uploadedAt: proof.uploadedAt },
        });
      } catch (error) {
        await discardProofFile(req.savedProof?.fileName);
        return handleMongooseError(sendError, res, error, "Error al guardar el comprobante.");
      }
    }
  );

  router.get(
    "/:id/payment-proofs/:proofId/file",
    validateObjectIdParam("id"),
    validateObjectIdParam("proofId"),
    resolveOrderActor,
    async (req, res) => {
      const proof = findProof(req.order, req.params.proofId);
      if (!proof) return sendError(res, 404, "PAYMENT_PROOF_NOT_FOUND", "Comprobante no encontrado.");
      const sent = await streamProofFile(res, proof);
      if (!sent) return sendError(res, 404, "PAYMENT_PROOF_FILE_NOT_FOUND", "El archivo del comprobante ya no existe.");
      return undefined;
    }
  );

  // ---- checkout público del storefront — sin verifyToken, rate-limited ----
  const checkoutRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 6,
    code: "RATE_LIMIT_CHECKOUT_EXCEEDED",
    message: "Demasiados intentos de pedido. Intenta de nuevo en unos minutos.",
    sendError,
  });

  router.post(
    "/public",
    checkoutRateLimiter,
    attachOptionalCustomer,
    validateCreatePayload(sendError),
    validateCheckoutExtras(sendError),
    async (req, res) => {
      try {
        const Product = mongooseConnection.models.Product;
        if (!Product) {
          return sendError(res, 500, "PRODUCTS_MODULE_NOT_MOUNTED", "El módulo de productos no está disponible.");
        }

        const built = await buildOrderItems(Product, req.body.items, { requireActive: true });
        if (built.error) {
          return sendError(res, built.error.status, built.error.code, built.error.message);
        }
        const quantityError = await checkPublicQuantities(
          mongooseConnection.models.Inventory,
          built.items,
          await getPurchaseLimit(mongooseConnection)
        );
        if (quantityError) {
          return sendError(res, quantityError.status, quantityError.code, quantityError.message);
        }

        // Entrega y pago contra la configuración de la tienda.
        const StoreConfig = mongooseConnection.models.StoreConfig;
        const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;
        const checkout = resolveCheckout(storeConfig, req.body);
        if (checkout.error) {
          return sendError(res, checkout.error.status, checkout.error.code, checkout.error.message);
        }

        const { pickupPointId, ...orderData } = req.body;
        if (checkout.deliveryMethod === "shipping") {
          const addr = orderData.shippingAddress || {};
          const missing = SHIPPING_ADDRESS_REQUIRED_FIELDS.filter((field) => !addr[field]);
          if (missing.length > 0) {
            return sendError(
              res,
              400,
              "VALIDATION_ERROR",
              `La dirección de envío está incompleta (falta: ${missing.join(", ")}).`
            );
          }
        } else {
          delete orderData.shippingAddress;
        }

        // Cupón (lib/coupons.js): el descuento se calcula aquí, nunca se toma
        // del cliente. Un cupón inválido detiene el pedido con su motivo, para
        // que el cliente no pague de más sin darse cuenta.
        const { couponCode, usePoints, giftCardCode, ...orderFields } = orderData;
        let couponResult = null;
        if (couponCode) {
          couponResult = await resolveCoupon(mongooseConnection, couponCode, {
            subtotal: built.total,
            customerEmail: orderFields.customerEmail,
            deliveryMethod: checkout.deliveryMethod,
          });
          if (couponResult.error) {
            return sendError(res, couponResult.error.status, couponResult.error.code, couponResult.error.message);
          }
        }
        const discountAmount = couponResult?.discount || 0;
        const itemsTotal = Math.max(0, built.total - discountAmount);

        // Puntos de lealtad (lib/loyalty.js): solo con sesión, hasta el tope
        // (% del subtotal ya con cupón) y desde el mínimo. Se apartan de forma
        // atómica junto con el cupón, justo antes de guardar.
        let pointsToUse = 0;
        if (usePoints) {
          if (!req.checkoutCustomerId) {
            return sendError(res, 401, "LOGIN_REQUIRED_FOR_POINTS", "Inicia sesión para usar tus puntos.");
          }
          if (!(await isProgramActive(mongooseConnection, "points"))) {
            return sendError(res, 400, "LOYALTY_NOT_AVAILABLE", "Esta tienda no tiene puntos de lealtad.");
          }
          const { points: rules } = await getLoyaltySettings(mongooseConnection);
          const maxPoints = roundMoney((itemsTotal * rules.maxRedeemPercent) / 100);
          if (usePoints > maxPoints) {
            return sendError(res, 400, "POINTS_OVER_LIMIT", `En este pedido puedes usar hasta $${maxPoints.toLocaleString("es-MX")} en puntos.`);
          }
          if (rules.minRedeem && usePoints < rules.minRedeem) {
            return sendError(res, 400, "POINTS_UNDER_MINIMUM", `Puedes usar tus puntos desde $${rules.minRedeem.toLocaleString("es-MX")}.`);
          }
          pointsToUse = usePoints;
        }

        // El envío gratis se mide contra el subtotal de productos (ya con
        // descuentos, también el del cupón), igual que en la canasta.
        const shippingCost = couponResult?.freeShipping
          ? 0
          : computeShippingCost(shippingSettingsOf(storeConfig), itemsTotal, checkout.deliveryMethod);

        // El uso se aparta justo antes de guardar: si otro pedido se llevó el
        // último, este no sale con el descuento.
        if (couponResult && !(await reserveCouponUse(mongooseConnection.models.Coupon, couponResult.coupon._id))) {
          return sendError(res, 409, "COUPON_EXHAUSTED", "Ese cupón ya se usó el máximo de veces.");
        }
        const releaseCoupon = () =>
          couponResult ? mongooseConnection.models.Coupon.updateOne({ _id: couponResult.coupon._id }, { $inc: { usedCount: -1 } }) : null;
        if (pointsToUse && !(await reservePoints(mongooseConnection, req.checkoutCustomerId, pointsToUse))) {
          await releaseCoupon();
          return sendError(res, 409, "INSUFFICIENT_POINTS", "No tienes puntos suficientes.");
        }
        const releasePoints = () =>
          pointsToUse ? mongooseConnection.models.LoyaltyAccount.updateOne({ customer: req.checkoutCustomerId }, { $inc: { points: pointsToUse } }) : null;

        // Tarjeta de regalo (lib/giftCards.js): paga lo que quede (productos −
        // cupón − puntos + envío) hasta su saldo. Se cobra de forma atómica
        // antes de guardar; si el pedido no se guarda, se regresa.
        const dueBeforeGift = roundMoney(itemsTotal - pointsToUse + shippingCost);
        const orderId = new mongoose.Types.ObjectId();
        let gift = null;
        if (giftCardCode) {
          const found = await findUsableCard(mongooseConnection, giftCardCode);
          if (found.error) {
            await releaseCoupon();
            await releasePoints();
            return sendError(res, found.error.status, found.error.code, found.error.message);
          }
          const amount = roundMoney(Math.min(found.card.balance, dueBeforeGift));
          if (amount > 0) {
            const charged = await debitCard(mongooseConnection, found.card._id, amount, { order: orderId, note: "Compra en línea" });
            if (!charged) {
              await releaseCoupon();
              await releasePoints();
              return sendError(res, 409, "GIFT_CARD_INSUFFICIENT", "El saldo de la tarjeta cambió. Revisa e intenta de nuevo.");
            }
            gift = { card: found.card._id, code: found.card.code, amount };
          }
        }
        const total = roundMoney(dueBeforeGift - (gift?.amount || 0));

        const orderNumber = await nextOrderNumber(Order);
        const order = new Order({
          _id: orderId,
          ...orderFields,
          ...checkout,
          items: built.items,
          shippingCost,
          total,
          ...(gift ? { giftCard: gift } : {}),
          ...(pointsToUse ? { loyalty: { customer: req.checkoutCustomerId, redeemed: pointsToUse } } : {}),
          ...(couponResult
            ? {
                discount: {
                  code: couponResult.coupon.code,
                  coupon: couponResult.coupon._id,
                  type: couponResult.coupon.type,
                  value: couponResult.coupon.value,
                  amount: discountAmount,
                  counted: true,
                },
              }
            : {}),
          orderNumber,
          // Pagado completo con la tarjeta: entra ya como pagado.
          status: total === 0 && gift ? "confirmed" : "pending",
          // Derivado del JWT verificado en attachOptionalCustomer, nunca de
          // req.body (validateCheckoutExtras ya lo borró ahí).
          ...(req.checkoutCustomerId ? { customer: req.checkoutCustomerId } : {}),
        });
        try {
          await order.save();
        } catch (error) {
          // Si el pedido no se guardó, el uso del cupón y los puntos apartados se devuelven.
          await releaseCoupon();
          await releasePoints();
          if (gift) await creditCard(mongooseConnection, gift.card, gift.amount, { order: orderId, note: "Pedido no se guardó" });
          throw error;
        }
        if (gift) {
          // El movimiento de la tarjeta queda ligado al pedido.
          await mongooseConnection.models.GiftCard.updateOne(
            { _id: gift.card, movements: { $elemMatch: { order: order._id } } },
            { $set: { "movements.$.note": `Pedido #${order.orderNumber}` } }
          );
        }
        if (order.status === "confirmed") {
          // Igual que al aprobar un pago: descuenta inventario y abona puntos.
          await syncInventoryForOrder(Order, mongooseConnection, order);
          await syncOrderLoyalty(Order, mongooseConnection, order);
        }
        if (pointsToUse) {
          const account = await mongooseConnection.models.LoyaltyAccount.findOne({ customer: req.checkoutCustomerId }).select("points").lean();
          await mongooseConnection.models.LoyaltyLedger.create({
            customer: req.checkoutCustomerId,
            program: "points",
            delta: -pointsToUse,
            balanceAfter: roundMoney(account?.points || 0),
            reason: "redeem",
            order: order._id,
            note: `Pedido #${order.orderNumber}`,
          });
        }

        // Con sesión: el carrito guardado (modules/cart.js) se vacía y, si se
        // le había mandado recordatorio, cuenta como venta recuperada. Sin
        // await: nunca tumba el pedido.
        if (req.checkoutCustomerId) settleCartAfterOrder(mongooseConnection, { customerId: req.checkoutCustomerId, order });

        sendCheckoutEmails(order, { mongooseConnection, generateOrderPdf }).catch((error) => {
          // El pedido ya se guardó — un correo fallido no debe verse como que
          // el pedido no se recibió. Solo se deja constancia en el log.
          console.error("No fue posible enviar los correos de confirmación del pedido:", error.message);
        });

        // Con este token el invitado puede subir su comprobante de pago sin
        // cuenta (header X-Order-Token en POST /:id/payment-proof). Solo sirve
        // para este pedido; vence con JWT_ORDER_ACCESS_EXPIRES_IN (30d).
        return res.status(201).json({
          message: "Pedido creado.",
          order: sanitizeDoc(order),
          orderAccessToken: signOrderAccessToken({ orderId: order._id }),
        });
      } catch (error) {
        return handleMongooseError(sendError, res, error, "Error al crear el pedido.");
      }
    }
  );

  // Página del pedido en el storefront (FRONTEND_URL/pedido/<id>?token=…, ver
  // customerOrderUrl): lo que el cliente necesita ver y nada más — sin notas
  // internas, sin datos de quién revisó. Mismos permisos que los
  // comprobantes (staff, dueño con sesión o invitado con X-Order-Token).
  router.get("/:id/summary", validateObjectIdParam("id"), resolveOrderActor, async (req, res) => {
    try {
      const { order } = req;
      const StoreConfig = mongooseConnection.models.StoreConfig;
      const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;
      const type = paymentTypeOf(order);
      const awaitingPayment = AWAITING_PAYMENT_STATUSES.includes(order.status);
      return res.status(200).json({
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          status: order.status,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          items: order.items.map((i) => ({
            productName: i.productName,
            variantLabel: i.variantLabel,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            compareAtPrice: i.compareAtPrice,
            subtotal: i.subtotal,
          })),
          shippingCost: order.shippingCost,
          discount: order.discount?.code ? { code: order.discount.code, type: order.discount.type, amount: order.discount.amount } : undefined,
          loyalty: order.loyalty ? { redeemed: order.loyalty.redeemed || 0, earned: order.loyalty.earnedCounted ? order.loyalty.earned : 0 } : undefined,
          giftCard: order.giftCard?.amount ? { code: order.giftCard.code, amount: order.giftCard.amount } : undefined,
          total: order.total,
          deliveryMethod: order.deliveryMethod,
          pickupPoint: order.pickupPoint,
          shippingAddress: order.shippingAddress,
          paymentMethodLabel: order.paymentMethodLabel,
          shipment: order.shipment,
        },
        payment: {
          type,
          // Cuenta a la que transferir solo mientras se espera el pago.
          spei: awaitingPayment ? resolveSpeiAccount(order, storeConfig) : null,
          instructions: type === "manual" ? order.paymentInstructions || "" : "",
        },
        paymentProofs: (order.paymentProofs || []).map((p) => ({
          _id: p._id,
          status: p.status,
          mimeType: p.mimeType,
          uploadedAt: p.uploadedAt,
          rejectReason: p.status === "rejected" ? p.rejectReason : undefined,
        })),
        canUploadProof:
          type === "spei" && awaitingPayment && (order.paymentProofs || []).length < MAX_PAYMENT_PROOFS,
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el pedido.");
    }
  });

  // Ticket del pedido en PDF — mismo criterio que GET /api/invoices/:id/pdf
  // (facturación interna de Duck-Hack), pero con los datos de ESTA tienda
  // (StoreConfig). Accesible por staff con `orders`, por el dueño (cuenta
  // vinculada o mismo correo, igual que GET /mine) o por el invitado con su
  // X-Order-Token (página del pedido).
  router.get("/:id/pdf", validateObjectIdParam("id"), resolveOrderActor, async (req, res) => {
    try {
      if (!generateOrderPdf) {
        return sendError(res, 500, "PDF_GENERATOR_NOT_AVAILABLE", "La generación de comprobantes no está disponible.");
      }
      const { order } = req;
      const StoreConfig = mongooseConnection.models.StoreConfig;
      const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="pedido-${order.orderNumber ?? order._id}.pdf"`);
      generateOrderPdf(order, storeConfig, res);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al generar el comprobante.");
    }
  });

  // ---- de aquí en adelante, todo el router exige JWT de staff ----
  router.use(verifyToken);

  const ensureOrderExists = async (req, res, next) => {
    try {
      // populate limitado a name/email (nunca password) — usado por GET/PUT/
      // DELETE; el detalle (GET) es lo único que hoy lo muestra en el admin.
      const order = await Order.findById(req.params.id).populate("customer", "name email");
      if (!order) return sendError(res, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
      await backfillInventoryFlag(Order, order);
      req.order = order;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el pedido.");
    }
  };

  router.get("/", canRead, async (req, res) => {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      // populate limitado a name/email (nunca password) — así el admin ve
      // qué pedidos vienen de una cuenta sin exponer el hash de contraseña.
      const orders = await Order.find(filter).sort({ createdAt: -1 }).populate("customer", "name email");
      return res.status(200).json({ items: orders.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar pedidos.");
    }
  });

  router.post("/", canWrite, validateCreatePayload(sendError), async (req, res) => {
    try {
      const Product = mongooseConnection.models.Product;
      if (!Product) {
        return sendError(res, 500, "PRODUCTS_MODULE_NOT_MOUNTED", "El módulo de productos no está disponible.");
      }

      // requireActive:false — venta manual de staff, igual que antes: se
      // puede facturar un producto ya dado de baja (por ejemplo para cerrar
      // un pedido telefónico acordado antes de desactivarlo).
      const built = await buildOrderItems(Product, req.body.items, { requireActive: false });
      if (built.error) {
        return sendError(res, built.error.status, built.error.code, built.error.message);
      }

      const orderNumber = await nextOrderNumber(Order);
      const order = new Order({ ...req.body, items: built.items, total: built.total, orderNumber });
      await order.save();
      return res.status(201).json({ message: "Pedido creado.", order: sanitizeDoc(order) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al crear el pedido.");
    }
  });

  // Autoservicio del cliente ("Mi cuenta > Mis pedidos" en frontend-user) —
  // cualquier rol autenticado, sin canRead (STAFF_ROLES): el filtro por
  // `customer`/`customerEmail` ya lo limita a lo propio, no hace falta
  // restringir por rol encima. Va ANTES de GET /:id a propósito: si quedara
  // después, Express probaría a interpretar "mine" como el :id del otro
  // endpoint (fallaría con INVALID_OBJECT_ID) en vez de llegar aquí.
  // También junta por `customerEmail` (no solo por `customer`) para que un
  // cliente que ya había comprado como invitado, con el mismo correo con el
  // que después creó su cuenta, vea esos pedidos viejos sin que haya hecho
  // falta vincularlos a mano.
  router.get("/mine", async (req, res) => {
    try {
      const User = mongooseConnection.models.User;
      const me = User && (await User.findById(req.user.id).select("email"));
      const filter = me?.email
        ? { $or: [{ customer: req.user.id }, { customerEmail: me.email }] }
        : { customer: req.user.id };

      const orders = await Order.find(filter).sort({ createdAt: -1 });
      return res.status(200).json({ items: orders.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar tus pedidos.");
    }
  });

  router.get("/:id", validateObjectIdParam("id"), canRead, ensureOrderExists, async (req, res) => {
    return res.status(200).json(sanitizeDoc(req.order));
  });

  router.put(
    "/:id",
    validateObjectIdParam("id"),
    canWrite,
    ensureOrderExists,
    validateUpdatePayload(sendError),
    async (req, res) => {
      try {
        const previousStatus = req.order.status;
        const allowedFields = ["status", "shippingAddress", "notes"];
        for (const key of allowedFields) {
          if (req.body[key] !== undefined) req.order[key] = req.body[key];
        }
        if (req.body.shipment !== undefined) {
          const current = req.order.shipment ? req.order.shipment.toObject() : {};
          req.order.shipment = { ...current, ...req.body.shipment };
        }
        if (!statusesFor(req.order.deliveryMethod).includes(req.order.status)) {
          const allowed = statusesFor(req.order.deliveryMethod).join(", ");
          return sendError(
            res,
            400,
            "STATUS_NOT_FOR_DELIVERY_METHOD",
            req.order.deliveryMethod === "pickup"
              ? `Un pedido para recoger en tienda usa "Listo para recoger" y "Recogido", no "Enviado"/"Entregado". Estados válidos: ${allowed}.`
              : `Un pedido con envío a domicilio usa "Enviado" y "Entregado". Estados válidos: ${allowed}.`
          );
        }
        const statusChanged = req.order.status !== previousStatus;
        if (statusChanged && req.order.status === "ready_for_pickup" && !req.order.readyForPickupAt) req.order.readyForPickupAt = new Date();
        if (statusChanged && req.order.status === "picked_up" && !req.order.pickedUpAt) req.order.pickedUpAt = new Date();
        if (statusChanged && req.order.status === "shipped" && !req.order.shipment?.shippedAt) {
          req.order.shipment = { ...(req.order.shipment ? req.order.shipment.toObject() : {}), shippedAt: new Date() };
        }
        if (statusChanged && req.order.status === "delivered" && !req.order.shipment?.deliveredAt) {
          req.order.shipment = { ...(req.order.shipment ? req.order.shipment.toObject() : {}), deliveredAt: new Date() };
        }
        // Confirmar a mano un pedido con comprobante pendiente cuenta como
        // aprobarlo (si no, quedaría "pendiente" para siempre en el panel).
        if (statusChanged && req.order.status === "confirmed") {
          for (const proof of req.order.paymentProofs || []) {
            if (proof.status === "pending") {
              proof.status = "approved";
              proof.reviewedBy = req.user.id;
              proof.reviewedAt = new Date();
            }
          }
        }
        await req.order.save();

        // Inventario y usos del cupón según el estado nuevo.
        await syncInventoryForOrder(Order, mongooseConnection, req.order);
        await syncCouponUse(Order, mongooseConnection, req.order);
        await syncOrderLoyalty(Order, mongooseConnection, req.order);
        await syncOrderGiftCard(Order, mongooseConnection, req.order);
        if (statusChanged && STATUS_NOTIFICATIONS.includes(req.order.status)) {
          notifyOrder(req.order, req.order.status, { mongooseConnection });
        }

        return res.status(200).json({ message: "Pedido actualizado.", order: sanitizeDoc(req.order) });
      } catch (error) {
        return handleMongooseError(sendError, res, error, "Error al actualizar el pedido.");
      }
    }
  );

  // Revisión de un comprobante (staff). approve → el pedido pasa a
  // "confirmed" (descuenta inventario) y se avisa al cliente; reject (con
  // motivo) → vuelve a "pending" si estaba en revisión y se le pide otro.
  router.post(
    "/:id/payment-proofs/:proofId/review",
    validateObjectIdParam("id"),
    validateObjectIdParam("proofId"),
    canWrite,
    ensureOrderExists,
    async (req, res) => {
      try {
        const decision = asTrimmedString(req.body?.decision);
        const reason = asTrimmedString(req.body?.reason).slice(0, 500);
        if (!["approve", "reject"].includes(decision)) {
          return sendError(res, 400, "VALIDATION_ERROR", 'decision debe ser "approve" o "reject".');
        }
        if (decision === "reject" && !reason) {
          return sendError(res, 400, "VALIDATION_ERROR", "Escribe el motivo del rechazo (se le envía al cliente).");
        }
        const proof = findProof(req.order, req.params.proofId);
        if (!proof) return sendError(res, 404, "PAYMENT_PROOF_NOT_FOUND", "Comprobante no encontrado.");
        if (proof.status !== "pending") {
          return sendError(res, 409, "PAYMENT_PROOF_ALREADY_REVIEWED", "Este comprobante ya fue revisado.");
        }

        const previousStatus = req.order.status;
        proof.status = decision === "approve" ? "approved" : "rejected";
        proof.reviewedBy = req.user.id;
        proof.reviewedAt = new Date();
        if (decision === "reject") proof.rejectReason = reason;

        if (decision === "approve" && AWAITING_PAYMENT_STATUSES.includes(previousStatus)) {
          req.order.status = "confirmed";
        }
        // Si quedan otros comprobantes por revisar, sigue en revisión.
        const stillPending = req.order.paymentProofs.some((p) => p.status === "pending");
        if (decision === "reject" && previousStatus === "payment_review" && !stillPending) {
          req.order.status = "pending";
        }
        await req.order.save();

        await syncInventoryForOrder(Order, mongooseConnection, req.order);
        await syncOrderLoyalty(Order, mongooseConnection, req.order);
        if (req.order.status === "confirmed" && previousStatus !== "confirmed") {
          notifyOrder(req.order, "confirmed", { mongooseConnection });
        }
        if (decision === "reject") notifyOrder(req.order, "proof_rejected", { mongooseConnection, reason });

        return res.status(200).json({
          message: decision === "approve" ? "Comprobante aprobado." : "Comprobante rechazado.",
          order: sanitizeDoc(req.order),
        });
      } catch (error) {
        return handleMongooseError(sendError, res, error, "Error al revisar el comprobante.");
      }
    }
  );

  // Enlace a la página del pedido para mandárselo al cliente (p. ej. por
  // WhatsApp) desde el admin. `url` null si la tienda no activó
  // customerProofUpload o falta FRONTEND_URL.
  router.get("/:id/customer-link", validateObjectIdParam("id"), canRead, ensureOrderExists, async (req, res) => {
    try {
      const StoreConfig = mongooseConnection.models.StoreConfig;
      const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;
      const enabled = Boolean(storeConfig?.customerProofUpload);
      return res.status(200).json({
        enabled,
        url: customerOrderUrl(req.order, storeConfig),
        expiresIn: process.env.JWT_ORDER_ACCESS_EXPIRES_IN || "30d",
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al generar el enlace del pedido.");
    }
  });

  router.delete("/:id", validateObjectIdParam("id"), canWrite, ensureOrderExists, async (req, res) => {
    try {
      const proofFiles = (req.order.paymentProofs || []).map((p) => p.fileName);
      // Si lo vendido ya se había descontado, regresa al inventario; y el uso
      // del cupón, si contaba, se libera.
      await syncInventoryForOrder(Order, mongooseConnection, req.order, { release: true });
      await syncCouponUse(Order, mongooseConnection, req.order, { release: true });
      await syncOrderLoyalty(Order, mongooseConnection, req.order, { release: true });
      await syncOrderGiftCard(Order, mongooseConnection, req.order, { release: true });
      await req.order.deleteOne();
      await Promise.all(proofFiles.map(discardProofFile));
      return res.status(200).json({ message: "Pedido eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el pedido.");
    }
  });

  app.use("/api/orders", router);
}

module.exports = {
  ORDER_STATUSES,
  statusesFor,
  name: "orders",
  registerRoutes,
  models: { Order: orderSchema },
};
