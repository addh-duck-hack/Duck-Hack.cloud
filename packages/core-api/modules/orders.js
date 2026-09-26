// Pedidos. Roadmap eCommerce (ver frontend-admin/src/components/AdminMenu.jsx).
// Dos formas de crear un pedido:
//   - POST /  (staff, canWrite) — venta manual desde el panel (telefónica,
//     mostrador, etc.); de ahí que siempre se pidan datos de contacto en texto
//     plano además de un `customer` opcional, en vez de exigir cuenta de usuario.
//   - POST /public (sin auth, rate-limited) — checkout real del storefront
//     (frontend-user). Mismo patrón que modules/mail.js: router público +
//     createRateLimiter importado directo (no viene por ctx). Sin pasarela de
//     pago: el pedido entra "pending" y la tienda confirma el pago a mano
//     (ver paymentMethod). Envía correo de confirmación al cliente y aviso a
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
const { getPurchaseLimit } = require("../lib/purchaseLimits");
const { getShippingSettings, computeShippingCost } = require("../lib/shipping");
const { sendMail } = require("../lib/mailer");
const { verifyAccessToken } = require("../lib/jwt");
const { extractBearerToken, ROLES: AUTH_ROLES } = require("../lib/authMiddleware");
const { orderConfirmationEmailTemplate, orderNotificationEmailTemplate } = require("../lib/emailTemplates");
const { recalculateStatus } = require("./inventory");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const PAYMENT_METHODS = ["transfer", "pickup"];

// Mismo set de campos que User.addresses en modules/auth.js — así una
// dirección de la libreta se copia tal cual al pedido (ver Cart.jsx en
// frontend-user). `interiorNumber` es el único opcional; los demás solo se
// exigen cuando paymentMethod es "transfer" (ver validateCheckoutExtras).
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
    // Sin pasarela de pago (decisión del cliente): el pedido siempre entra
    // "pending" y la tienda confirma el pago/entrega a mano. "transfer" =
    // transferencia/SPEI (requiere shippingAddress, ver validateCheckoutExtras),
    // "pickup" = paga y recoge en la finca.
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "transfer" },
    // Folio legible para soporte/correos — no confundir con _id. Sin `unique`
    // a propósito: con el volumen de pedidos de esta tienda un choque por
    // concurrencia es despreciable (ver nextOrderNumber más abajo) y un
    // duplicado raro no rompe nada.
    orderNumber: { type: Number, index: true },
  },
  { timestamps: true }
);
orderSchema.index({ status: 1 });
orderSchema.index({ customer: 1 });

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

  if (payload.customerPhone !== undefined) req.body.customerPhone = asTrimmedString(payload.customerPhone);
  if (payload.shippingAddress !== undefined) req.body.shippingAddress = normalizeShippingAddress(payload.shippingAddress);
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
    normalizedItems.push({ product: item.product, quantity });
  }
  req.body.items = normalizedItems;

  // status/total/shippingCost/productName/unitPrice/subtotal se calculan en
  // el handler, nunca se aceptan del cliente.
  delete req.body.status;
  delete req.body.total;
  delete req.body.shippingCost;

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
  if (payload.shippingAddress !== undefined) req.body.shippingAddress = normalizeShippingAddress(payload.shippingAddress);
  if (payload.notes !== undefined) req.body.notes = asTrimmedString(payload.notes);

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

// Solo para POST /public, encadenado DESPUÉS de validateCreatePayload. Valida
// paymentMethod y exige los campos de shippingAddress (ver
// SHIPPING_ADDRESS_REQUIRED_FIELDS) cuando es "transfer". También bloquea
// que un checkout anónimo se adjudique un
// `customer` o un `orderNumber` arbitrarios enviados en el payload —
// orderNumber siempre lo pone el servidor, y `customer` SOLO puede venir de
// un JWT verificado (ver attachOptionalCustomer/req.checkoutCustomerId), nunca
// de lo que mande el cliente en el body — si no, cualquiera podría adjudicarse
// el pedido a la cuenta de otra persona con solo mandar su id.
const validateCheckoutExtras = (sendError) => (req, res, next) => {
  const payload = req.body || {};

  const paymentMethod = payload.paymentMethod ? asTrimmedString(payload.paymentMethod) : "transfer";
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return sendError(res, 400, "VALIDATION_ERROR", `paymentMethod debe ser uno de: ${PAYMENT_METHODS.join(", ")}.`);
  }
  req.body.paymentMethod = paymentMethod;

  if (paymentMethod === "transfer") {
    const addr = req.body.shippingAddress || {};
    const missing = SHIPPING_ADDRESS_REQUIRED_FIELDS.filter((field) => !addr[field]);
    if (missing.length > 0) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        `La dirección de envío está incompleta para pago por transferencia/envío (falta: ${missing.join(", ")}).`
      );
    }
  }

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
    const subtotal = product.price * item.quantity;
    const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
    items.push({
      product: product._id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      ...(hasDiscount ? { compareAtPrice: product.compareAtPrice } : {}),
      subtotal,
    });
  }
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  return { items, total };
};

// Checkout público: por producto (sumando sus renglones — el mismo café en
// dos presentaciones cuenta junto) no se pueden pedir más unidades que el tope
// de la tienda (`purchaseLimit`, lib/purchaseLimits.js; null = sin tope) ni más
// de las que hay en inventario.
// Mismo criterio que GET /api/products/public#maxQty, que es lo que el
// storefront ya limita; esto es la red por si llega un payload a mano o el
// inventario bajó mientras el cliente tenía la canasta abierta. Solo lee el
// inventario — se descuenta hasta confirmar el pedido (adjustInventoryForOrder).
const checkPublicQuantities = async (Inventory, items, purchaseLimit) => {
  const units = new Map();
  for (const item of items) {
    const id = String(item.product);
    const current = units.get(id) || { name: item.productName, quantity: 0 };
    current.quantity += item.quantity;
    units.set(id, current);
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
    ? await Inventory.find({ product: { $in: [...units.keys()] } }).select("product quantity").lean()
    : [];
  const stockById = new Map(stock.map((i) => [String(i.product), i.quantity]));
  for (const [id, { name, quantity }] of units) {
    const available = stockById.get(id) || 0;
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

  const { html, text } = orderConfirmationEmailTemplate({ order, storeConfig, logoAbsoluteUrl });

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

// Ajusta el inventario de cada producto del pedido — sign=-1 al confirmar
// (se descuenta lo vendido), sign=+1 al salir de "confirmed" hacia cualquier
// otro estado (se regresa el stock — decisión explícita: un pedido
// confirmado por error, o cancelado después de confirmado, no debe dejar el
// inventario descuadrado). Nunca bloquea la actualización del pedido, que ya
// se guardó antes de llamar esto — best-effort: si Inventory no está
// montado, o un producto no tiene registro de inventario, ese renglón
// simplemente se ignora.
const adjustInventoryForOrder = async (mongooseConnection, order, sign) => {
  const Inventory = mongooseConnection.models.Inventory;
  if (!Inventory) return;

  for (const item of order.items) {
    try {
      const updated = await Inventory.findOneAndUpdate(
        { product: item.product },
        { $inc: { quantity: sign * item.quantity } },
        { new: true }
      );
      if (!updated) continue; // producto sin registro de inventario — nada que ajustar

      // Nunca queda en negativo: si varios pedidos se confirmaron con más
      // unidades de las que había, se recorta a 0 en vez de mostrar un stock
      // imposible.
      const clampedQuantity = Math.max(0, updated.quantity);
      const status = recalculateStatus(clampedQuantity, updated.lowStockThreshold || 0);
      if (clampedQuantity !== updated.quantity || status !== updated.status) {
        updated.quantity = clampedQuantity;
        updated.status = status;
        await updated.save();
      }
    } catch (error) {
      console.error(`No fue posible ajustar el inventario del producto ${item.product}:`, error.message);
    }
  }
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, authorizeRoles, ROLES, STAFF_ROLES, sendError, generateOrderPdf } = ctx;
  const Order = getOrCreateModel(mongooseConnection, "Order", orderSchema);

  const router = express.Router();

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

        // El envío gratis se mide contra el subtotal de productos (ya con
        // descuentos), igual que en la canasta del storefront.
        const shippingCost = computeShippingCost(
          await getShippingSettings(mongooseConnection),
          built.total,
          req.body.paymentMethod
        );

        const orderNumber = await nextOrderNumber(Order);
        const order = new Order({
          ...req.body,
          items: built.items,
          shippingCost,
          total: built.total + shippingCost,
          orderNumber,
          status: "pending",
          // Derivado del JWT verificado en attachOptionalCustomer, nunca de
          // req.body (validateCheckoutExtras ya lo borró ahí).
          ...(req.checkoutCustomerId ? { customer: req.checkoutCustomerId } : {}),
        });
        await order.save();

        sendCheckoutEmails(order, { mongooseConnection, generateOrderPdf }).catch((error) => {
          // El pedido ya se guardó — un correo fallido no debe verse como que
          // el pedido no se recibió. Solo se deja constancia en el log.
          console.error("No fue posible enviar los correos de confirmación del pedido:", error.message);
        });

        return res.status(201).json({ message: "Pedido creado.", order: sanitizeDoc(order) });
      } catch (error) {
        return handleMongooseError(sendError, res, error, "Error al crear el pedido.");
      }
    }
  );

  // ---- de aquí en adelante, todo el router exige JWT de staff ----
  router.use(verifyToken);

  const canRead = authorizeRoles(...STAFF_ROLES);
  const canWrite = authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.COLLABORATOR);

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) {
      return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    }
    return next();
  };

  const ensureOrderExists = async (req, res, next) => {
    try {
      // populate limitado a name/email (nunca password) — usado por GET/PUT/
      // DELETE; el detalle (GET) es lo único que hoy lo muestra en el admin.
      const order = await Order.findById(req.params.id).populate("customer", "name email");
      if (!order) return sendError(res, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
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
        await req.order.save();

        // Ajuste de inventario SOLO en la transición hacia/desde "confirmed"
        // — nunca al volver a guardar un pedido que ya estaba (o sigue sin
        // estar) confirmado. Ver adjustInventoryForOrder arriba.
        const nowConfirmed = req.order.status === "confirmed";
        const wasConfirmed = previousStatus === "confirmed";
        if (nowConfirmed !== wasConfirmed) {
          await adjustInventoryForOrder(mongooseConnection, req.order, nowConfirmed ? -1 : 1);
        }

        return res.status(200).json({ message: "Pedido actualizado.", order: sanitizeDoc(req.order) });
      } catch (error) {
        return handleMongooseError(sendError, res, error, "Error al actualizar el pedido.");
      }
    }
  );

  // Comprobante del pedido en PDF — mismo criterio que
  // GET /api/invoices/:id/pdf (facturación interna de Duck-Hack), pero con
  // los datos de ESTA tienda (StoreConfig), no los de Duck-Hack. Accesible
  // por staff o por el dueño del pedido (cuenta vinculada o mismo correo,
  // igual que GET /mine) — un pedido de invitado sin cuenta no se puede
  // descargar por aquí (no hay con qué autenticarse como "el invitado").
  router.get("/:id/pdf", validateObjectIdParam("id"), async (req, res) => {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) return sendError(res, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");

      const isStaff = STAFF_ROLES.includes(req.user.role);
      let isOwner = false;
      if (!isStaff) {
        if (order.customer && String(order.customer) === String(req.user.id)) {
          isOwner = true;
        } else {
          const User = mongooseConnection.models.User;
          const me = User && (await User.findById(req.user.id).select("email"));
          if (me?.email && me.email === order.customerEmail) isOwner = true;
        }
      }
      if (!isStaff && !isOwner) {
        return sendError(res, 403, "FORBIDDEN", "No tienes permisos para ver este pedido.");
      }

      if (!generateOrderPdf) {
        return sendError(res, 500, "PDF_GENERATOR_NOT_AVAILABLE", "La generación de comprobantes no está disponible.");
      }

      const StoreConfig = mongooseConnection.models.StoreConfig;
      const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="pedido-${order.orderNumber ?? order._id}.pdf"`);
      generateOrderPdf(order, storeConfig, res);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al generar el comprobante.");
    }
  });

  router.delete("/:id", validateObjectIdParam("id"), canWrite, ensureOrderExists, async (req, res) => {
    try {
      await req.order.deleteOne();
      return res.status(200).json({ message: "Pedido eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el pedido.");
    }
  });

  app.use("/api/orders", router);
}

module.exports = {
  name: "orders",
  registerRoutes,
  models: { Order: orderSchema },
};
