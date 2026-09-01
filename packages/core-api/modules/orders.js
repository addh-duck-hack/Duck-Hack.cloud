// Pedidos. Roadmap eCommerce (ver frontend-admin/src/components/AdminMenu.jsx).
// No hay carrito/checkout en frontend-user todavía, así que por ahora todo
// pedido se crea manualmente desde el panel (venta telefónica, mostrador,
// etc.) — de ahí que siempre se pidan datos de contacto en texto plano
// además de un `customer` opcional, en vez de exigir una cuenta de usuario.
const express = require("express");
const mongoose = require("mongoose");
const {
  sanitizeDoc,
  handleMongooseError,
  asFiniteNumber,
  asTrimmedString,
  isValidObjectId,
  getOrCreateModel,
} = require("../lib/moduleHelpers");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // Snapshot de nombre/precio al momento de crear el pedido — si el
    // producto cambia de precio después, el pedido ya hecho no se mueve
    // (mismo criterio que Invoice.items, ver backend/models/invoice.model.js).
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true, maxlength: 200 },
    customerEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    customerPhone: { type: String, trim: true, maxlength: 40 },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "El pedido debe tener al menos un artículo.",
      },
    },
    status: { type: String, enum: ORDER_STATUSES, default: "pending" },
    // Calculado server-side = suma de items[].subtotal, nunca aceptado del
    // cliente — mismo criterio que Invoice.amount (backend/routes/invoices.routes.js).
    total: { type: Number, required: true, min: 0 },
    shippingAddress: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 1000 },
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
  if (payload.shippingAddress !== undefined) req.body.shippingAddress = asTrimmedString(payload.shippingAddress);
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

  // status/total/productName/unitPrice/subtotal se calculan en el handler,
  // nunca se aceptan del cliente.
  delete req.body.status;
  delete req.body.total;

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
  if (payload.shippingAddress !== undefined) req.body.shippingAddress = asTrimmedString(payload.shippingAddress);
  if (payload.notes !== undefined) req.body.notes = asTrimmedString(payload.notes);

  // items/customer/total no se reabren después de creado — ver plan.
  delete req.body.items;
  delete req.body.total;
  delete req.body.customer;
  delete req.body.customerName;
  delete req.body.customerEmail;
  delete req.body.customerPhone;

  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, authorizeRoles, ROLES, STAFF_ROLES, sendError } = ctx;
  const Order = getOrCreateModel(mongooseConnection, "Order", orderSchema);

  const router = express.Router();
  router.use(verifyToken);

  const canRead = authorizeRoles(...STAFF_ROLES);
  const canWrite = authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.ORDER_MANAGER);

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) {
      return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    }
    return next();
  };

  const ensureOrderExists = async (req, res, next) => {
    try {
      const order = await Order.findById(req.params.id);
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
      const orders = await Order.find(filter).sort({ createdAt: -1 });
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

      const products = await Product.find({ _id: { $in: req.body.items.map((i) => i.product) } });
      const productsById = new Map(products.map((p) => [String(p._id), p]));

      const items = [];
      for (const item of req.body.items) {
        const product = productsById.get(String(item.product));
        if (!product) {
          return sendError(res, 404, "PRODUCT_NOT_FOUND", `El producto ${item.product} no existe.`);
        }
        const subtotal = product.price * item.quantity;
        items.push({
          product: product._id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.price,
          subtotal,
        });
      }
      const total = items.reduce((sum, i) => sum + i.subtotal, 0);

      const order = new Order({ ...req.body, items, total });
      await order.save();
      return res.status(201).json({ message: "Pedido creado.", order: sanitizeDoc(order) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al crear el pedido.");
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
        const allowedFields = ["status", "shippingAddress", "notes"];
        for (const key of allowedFields) {
          if (req.body[key] !== undefined) req.order[key] = req.body[key];
        }
        await req.order.save();
        return res.status(200).json({ message: "Pedido actualizado.", order: sanitizeDoc(req.order) });
      } catch (error) {
        return handleMongooseError(sendError, res, error, "Error al actualizar el pedido.");
      }
    }
  );

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
