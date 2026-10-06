// Mayoreo (`/api/wholesale`, clave de permisos `wholesale`): clientes que le
// compran a la tienda por volumen (en Tacita, las cafeterías asociadas; en
// otra tienda, revendedores o negocios), sus ventas y lo que deben.
//
// - Cliente mayorista: datos de contacto/facturación, días de crédito
//   (0 = contado), límite de crédito opcional y % de descuento sugerido sobre
//   el precio de catálogo.
// - Venta: borrador → entregada (descuenta inventario, lib/stockMovements.js,
//   y abre la cuenta por cobrar con vencimiento = entrega + días de crédito) →
//   abonos hasta saldar. Cancelar regresa el stock; con abonos no se puede.
//   Sin el tope de piezas por pedido de la tienda en línea (como los pedidos
//   de staff).
// - Los abonos son ingresos de la tienda: Contabilidad (modules/storeAccounting.js)
//   los lee de aquí, no se copian.
const express = require("express");
const mongoose = require("mongoose");
const {
  sanitizeDoc,
  handleMongooseError,
  asTrimmedString,
  asFiniteNumber,
  isValidObjectId,
  getOrCreateModel,
  createWithFolio,
} = require("../lib/moduleHelpers");
const { createModuleAuthorizer } = require("../lib/permissions");
const { parseMxPhone } = require("../lib/phone");
const { adjustStock } = require("../lib/stockMovements");
const { MAX_LINES, round2, loadProducts, resolveProductLine, parseQuantity, parseMoney } = require("../lib/lineItems");

const DAY = 24 * 60 * 60 * 1000;
const SALE_STATUSES = ["draft", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "partial", "paid"];
const PAYMENT_METHODS = ["cash", "transfer", "card", "other"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

const wholesaleCustomerSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, trim: true, maxlength: 120, default: "" },
    email: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    phone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, maxlength: 300, default: "" },
    billingName: { type: String, trim: true, maxlength: 160, default: "" },
    billingRfc: { type: String, trim: true, uppercase: true, maxlength: 13, default: "" },
    // 0 = contado. El vencimiento de cada venta = entrega + creditDays.
    creditDays: { type: Number, min: 0, max: 365, default: 0 },
    // null = sin límite. Se revisa al entregar (saldo pendiente + venta).
    creditLimit: { type: Number, min: 0, default: null },
    // Descuento sugerido sobre el precio de catálogo al armar una venta.
    discountPct: { type: Number, min: 0, max: 90, default: 0 },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
wholesaleCustomerSchema.index({ businessName: 1 });

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: mongoose.Schema.Types.ObjectId, default: null },
    productName: { type: String, required: true },
    variantLabel: { type: String, default: "" },
    sku: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 0.001 },
    unitPrice: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const salePaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    paidAt: { type: Date, required: true },
    method: { type: String, enum: PAYMENT_METHODS, default: "transfer" },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const wholesaleSaleSchema = new mongoose.Schema(
  {
    folio: { type: Number, unique: true, sparse: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "WholesaleCustomer", required: true },
    // Snapshot del nombre: la venta se lee igual aunque el cliente cambie.
    customerName: { type: String, trim: true, default: "" },
    items: { type: [saleItemSchema], default: [] },
    subtotal: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: SALE_STATUSES, default: "draft" },
    deliveredAt: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    payments: { type: [salePaymentSchema], default: [] },
    // Recalculados server-side, nunca aceptados del cliente.
    amountPaid: { type: Number, min: 0, default: 0 },
    balance: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "pending" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
wholesaleSaleSchema.index({ customer: 1, status: 1 });
wholesaleSaleSchema.index({ status: 1, balance: 1, dueDate: 1 });
wholesaleSaleSchema.index({ "payments.paidAt": 1 });

const paymentStatusOf = (total, amountPaid) => {
  if (amountPaid <= 0.004) return "pending";
  if (amountPaid >= total - 0.004) return "paid";
  return "partial";
};

// AAAA-MM-DD o ISO → Date; vacío → fallback; inválido → undefined.
const parseDate = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
  return Number.isNaN(+date) ? undefined : date;
};

// ---- validadores (a mano, como el resto del paquete) ----

const validateCustomerPayload = (sendError) => (req, res, next) => {
  const p = req.body || {};
  const isCreate = req.method === "POST";
  const out = {};

  if (isCreate || p.businessName !== undefined) {
    out.businessName = asTrimmedString(p.businessName);
    if (!out.businessName) return sendError(res, 400, "VALIDATION_ERROR", "El nombre del negocio es obligatorio.");
    if (out.businessName.length > 120) return sendError(res, 400, "VALIDATION_ERROR", "El nombre del negocio admite hasta 120 caracteres.");
  }
  for (const [key, max] of [["contactName", 120], ["address", 300], ["billingName", 160], ["notes", 1000]]) {
    if (p[key] === undefined) continue;
    out[key] = asTrimmedString(p[key]);
    if (out[key].length > max) return sendError(res, 400, "VALIDATION_ERROR", `${key} admite hasta ${max} caracteres.`);
  }
  if (p.email !== undefined) {
    out.email = asTrimmedString(p.email).toLowerCase();
    if (out.email && !EMAIL_PATTERN.test(out.email)) return sendError(res, 400, "VALIDATION_ERROR", "El correo no es válido.");
  }
  if (p.phone !== undefined) {
    const parsed = parseMxPhone(p.phone);
    if (parsed.error) return sendError(res, 400, "VALIDATION_ERROR", parsed.error);
    out.phone = parsed.value;
  }
  if (p.billingRfc !== undefined) {
    out.billingRfc = asTrimmedString(p.billingRfc).toUpperCase();
    if (out.billingRfc && !RFC_PATTERN.test(out.billingRfc)) return sendError(res, 400, "VALIDATION_ERROR", "El RFC no es válido.");
  }
  if (p.creditDays !== undefined) {
    const days = asFiniteNumber(p.creditDays === "" ? 0 : p.creditDays);
    if (days === null || days < 0 || days > 365 || !Number.isInteger(days)) {
      return sendError(res, 400, "VALIDATION_ERROR", "Los días de crédito deben ser un entero entre 0 y 365.");
    }
    out.creditDays = days;
  }
  if (p.creditLimit !== undefined) {
    if (p.creditLimit === null || p.creditLimit === "") out.creditLimit = null;
    else {
      const parsed = parseMoney(p.creditLimit, "El límite de crédito");
      if (parsed.error) return sendError(res, 400, "VALIDATION_ERROR", parsed.error);
      out.creditLimit = parsed.value;
    }
  }
  if (p.discountPct !== undefined) {
    const pct = asFiniteNumber(p.discountPct === "" ? 0 : p.discountPct);
    if (pct === null || pct < 0 || pct > 90) return sendError(res, 400, "VALIDATION_ERROR", "El descuento debe estar entre 0 y 90 %.");
    out.discountPct = round2(pct);
  }
  if (p.isActive !== undefined) out.isActive = Boolean(p.isActive);

  req.body = out;
  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Customer = getOrCreateModel(mongooseConnection, "WholesaleCustomer", wholesaleCustomerSchema);
  const Sale = getOrCreateModel(mongooseConnection, "WholesaleSale", wholesaleSaleSchema);

  const router = express.Router();
  router.use(verifyToken);
  // Contabilidad consulta clientes, ventas y saldos (solo lectura).
  router.use(createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModuleAccess({ module: "wholesale", readAlso: ["storeAccounting"] }));

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    return next();
  };

  const loadCustomer = async (req, res, next) => {
    try {
      const customer = await Customer.findById(req.params.id);
      if (!customer) return sendError(res, 404, "WHOLESALE_CUSTOMER_NOT_FOUND", "Cliente mayorista no encontrado.");
      req.customer = customer;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el cliente.");
    }
  };

  const loadSale = async (req, res, next) => {
    try {
      const sale = await Sale.findById(req.params.id);
      if (!sale) return sendError(res, 404, "WHOLESALE_SALE_NOT_FOUND", "Venta no encontrada.");
      req.sale = sale;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la venta.");
    }
  };

  // Saldo pendiente (ventas entregadas) por cliente: { [customerId]: { balance, overdue } }.
  const balancesByCustomer = async (customerIds) => {
    const match = { status: "delivered", balance: { $gt: 0.004 } };
    if (customerIds) match.customer = { $in: customerIds.map((id) => new mongoose.Types.ObjectId(String(id))) };
    const now = new Date();
    const rows = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$customer",
          balance: { $sum: "$balance" },
          overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$dueDate", null] }, { $lt: ["$dueDate", now] }] }, "$balance", 0] } },
          openSales: { $sum: 1 },
        },
      },
    ]);
    return new Map(rows.map((r) => [String(r._id), { balance: round2(r.balance), overdue: round2(r.overdue), openSales: r.openSales }]));
  };

  // ---- clientes ----

  router.get("/customers", async (req, res) => {
    try {
      const filter = {};
      if (req.query.active === "true") filter.isActive = true;
      if (req.query.active === "false") filter.isActive = false;
      const q = asTrimmedString(req.query.q);
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filter.$or = [{ businessName: rx }, { contactName: rx }, { email: rx }];
      }
      const customers = await Customer.find(filter).sort({ businessName: 1 }).lean();
      const balances = await balancesByCustomer(customers.map((c) => c._id));
      return res.status(200).json({
        customers: customers.map((c) => ({ ...sanitizeDoc(c), ...(balances.get(String(c._id)) || { balance: 0, overdue: 0, openSales: 0 }) })),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar los clientes mayoristas.");
    }
  });

  router.post("/customers", validateCustomerPayload(sendError), async (req, res) => {
    try {
      const customer = await Customer.create(req.body);
      return res.status(201).json({ message: "Cliente mayorista registrado.", customer: sanitizeDoc(customer) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al registrar el cliente mayorista.");
    }
  });

  router.get("/customers/:id", validateObjectIdParam("id"), loadCustomer, async (req, res) => {
    const balances = await balancesByCustomer([req.customer._id]);
    return res.status(200).json({ ...sanitizeDoc(req.customer), ...(balances.get(String(req.customer._id)) || { balance: 0, overdue: 0, openSales: 0 }) });
  });

  router.put("/customers/:id", validateObjectIdParam("id"), loadCustomer, validateCustomerPayload(sendError), async (req, res) => {
    try {
      req.customer.set(req.body);
      await req.customer.save();
      return res.status(200).json({ message: "Cliente mayorista actualizado.", customer: sanitizeDoc(req.customer) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al actualizar el cliente mayorista.");
    }
  });

  // Solo sin ventas: con historial se desactiva (isActive: false).
  router.delete("/customers/:id", validateObjectIdParam("id"), loadCustomer, async (req, res) => {
    try {
      if (await Sale.exists({ customer: req.customer._id })) {
        return sendError(res, 409, "WHOLESALE_CUSTOMER_HAS_SALES", "El cliente tiene ventas registradas: desactívalo en lugar de borrarlo.");
      }
      await req.customer.deleteOne();
      return res.status(200).json({ message: "Cliente mayorista eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el cliente mayorista.");
    }
  });

  // Estado de cuenta: cargos (ventas entregadas) y abonos en orden, con saldo
  // corrido; más los totales.
  router.get("/customers/:id/statement", validateObjectIdParam("id"), loadCustomer, async (req, res) => {
    try {
      const sales = await Sale.find({ customer: req.customer._id, status: { $ne: "cancelled" } }).sort({ createdAt: -1 }).lean();
      const entries = [];
      for (const sale of sales) {
        if (sale.status !== "delivered") continue;
        entries.push({ date: sale.deliveredAt, kind: "charge", sale: sale._id, folio: sale.folio, amount: sale.total, dueDate: sale.dueDate });
        for (const payment of sale.payments || []) {
          entries.push({ date: payment.paidAt, kind: "payment", sale: sale._id, folio: sale.folio, amount: payment.amount, method: payment.method, note: payment.note });
        }
      }
      entries.sort((a, b) => new Date(a.date) - new Date(b.date) || (a.kind === "charge" ? -1 : 1));
      let running = 0;
      for (const entry of entries) {
        running = round2(running + (entry.kind === "charge" ? entry.amount : -entry.amount));
        entry.balance = running;
      }
      const delivered = sales.filter((s) => s.status === "delivered");
      const now = Date.now();
      return res.status(200).json({
        customer: sanitizeDoc(req.customer),
        totals: {
          sold: round2(delivered.reduce((s, x) => s + x.total, 0)),
          paid: round2(delivered.reduce((s, x) => s + x.amountPaid, 0)),
          balance: round2(delivered.reduce((s, x) => s + x.balance, 0)),
          overdue: round2(delivered.filter((x) => x.dueDate && +new Date(x.dueDate) < now).reduce((s, x) => s + x.balance, 0)),
        },
        entries,
        sales: sales.map(sanitizeDoc),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al armar el estado de cuenta.");
    }
  });

  // ---- ventas ----

  // Renglones + descuento → { items, subtotal, discount, total } o { error }.
  // Sin unitPrice, el precio sugerido = catálogo − descuento del cliente.
  const buildSaleLines = async (rawItems, rawDiscount, customer) => {
    if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: "La venta necesita al menos un producto." };
    if (rawItems.length > MAX_LINES) return { error: `La venta admite hasta ${MAX_LINES} renglones.` };
    const productsById = await loadProducts(mongooseConnection, rawItems);
    const items = [];
    for (const [index, raw] of rawItems.entries()) {
      const line = resolveProductLine(productsById, raw, index);
      if (line.error) return line;
      const quantity = parseQuantity(raw.quantity, index);
      if (quantity.error) return quantity;
      let unitPrice;
      if (raw.unitPrice === undefined || raw.unitPrice === null || raw.unitPrice === "") {
        unitPrice = round2(line.value.listPrice * (1 - (customer.discountPct || 0) / 100));
      } else {
        const parsed = parseMoney(raw.unitPrice, `El precio del renglón ${index + 1}`);
        if (parsed.error) return parsed;
        unitPrice = parsed.value;
      }
      const { listPrice, ...snapshot } = line.value;
      items.push({ ...snapshot, quantity: quantity.value, unitPrice, subtotal: round2(quantity.value * unitPrice) });
    }
    const subtotal = round2(items.reduce((s, i) => s + i.subtotal, 0));
    let discount = 0;
    if (rawDiscount !== undefined && rawDiscount !== null && rawDiscount !== "") {
      const parsed = parseMoney(rawDiscount, "El descuento");
      if (parsed.error) return parsed;
      discount = parsed.value;
    }
    if (discount > subtotal) return { error: "El descuento no puede ser mayor al subtotal." };
    return { items, subtotal, discount, total: round2(subtotal - discount) };
  };

  const saleResponse = (sale) => sanitizeDoc(sale);

  router.get("/sales", async (req, res) => {
    try {
      const filter = {};
      if (isValidObjectId(req.query.customer)) filter.customer = req.query.customer;
      if (SALE_STATUSES.includes(req.query.status)) filter.status = req.query.status;
      if (PAYMENT_STATUSES.includes(req.query.paymentStatus)) filter.paymentStatus = req.query.paymentStatus;
      if (req.query.overdue === "true") {
        filter.status = "delivered";
        filter.balance = { $gt: 0.004 };
        filter.dueDate = { $lt: new Date() };
      }
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lt = new Date(+to + DAY / 2);
      }
      const sales = await Sale.find(filter).sort({ createdAt: -1 }).limit(500).select("-items").lean();
      return res.status(200).json({ sales: sales.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar las ventas de mayoreo.");
    }
  });

  router.post("/sales", async (req, res) => {
    try {
      const p = req.body || {};
      if (!isValidObjectId(p.customer)) return sendError(res, 400, "VALIDATION_ERROR", "Elige el cliente mayorista.");
      const customer = await Customer.findById(p.customer).lean();
      if (!customer) return sendError(res, 404, "WHOLESALE_CUSTOMER_NOT_FOUND", "Cliente mayorista no encontrado.");
      if (!customer.isActive) return sendError(res, 409, "WHOLESALE_CUSTOMER_INACTIVE", "El cliente está desactivado.");
      const lines = await buildSaleLines(p.items, p.discount, customer);
      if (lines.error) return sendError(res, 400, "VALIDATION_ERROR", lines.error);
      const notes = asTrimmedString(p.notes).slice(0, 1000);
      const sale = await createWithFolio(Sale, "folio", {
        customer: customer._id,
        customerName: customer.businessName,
        ...lines,
        balance: lines.total,
        notes,
        createdBy: req.user?.id || null,
      });
      return res.status(201).json({ message: "Venta registrada como borrador.", sale: saleResponse(sale) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al registrar la venta.");
    }
  });

  router.get("/sales/:id", validateObjectIdParam("id"), loadSale, async (req, res) => {
    await req.sale.populate("customer", "businessName contactName email phone creditDays creditLimit discountPct isActive");
    await req.sale.populate("payments.by", "name email");
    return res.status(200).json(saleResponse(req.sale));
  });

  // Solo borradores: lo entregado ya movió inventario y saldo (notas sí).
  router.put("/sales/:id", validateObjectIdParam("id"), loadSale, async (req, res) => {
    try {
      const p = req.body || {};
      if (p.notes !== undefined) req.sale.notes = asTrimmedString(p.notes).slice(0, 1000);
      const touchesLines = p.items !== undefined || p.discount !== undefined || p.customer !== undefined;
      if (touchesLines) {
        if (req.sale.status !== "draft") {
          return sendError(res, 409, "WHOLESALE_SALE_NOT_EDITABLE", "Solo se pueden cambiar productos y precios de una venta en borrador.");
        }
        let customer = await Customer.findById(p.customer !== undefined ? p.customer : req.sale.customer).lean();
        if (!customer) return sendError(res, 404, "WHOLESALE_CUSTOMER_NOT_FOUND", "Cliente mayorista no encontrado.");
        const lines = await buildSaleLines(p.items !== undefined ? p.items : req.sale.items.map((i) => i.toObject()), p.discount !== undefined ? p.discount : req.sale.discount, customer);
        if (lines.error) return sendError(res, 400, "VALIDATION_ERROR", lines.error);
        req.sale.set({ ...lines, customer: customer._id, customerName: customer.businessName, balance: lines.total });
      }
      await req.sale.save();
      return res.status(200).json({ message: "Venta actualizada.", sale: saleResponse(req.sale) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al actualizar la venta.");
    }
  });

  router.delete("/sales/:id", validateObjectIdParam("id"), loadSale, async (req, res) => {
    if (req.sale.status !== "draft") {
      return sendError(res, 409, "WHOLESALE_SALE_NOT_EDITABLE", "Solo se borran ventas en borrador; una entregada se cancela.");
    }
    await req.sale.deleteOne();
    return res.status(200).json({ message: "Venta eliminada." });
  });

  // Entregar: descuenta inventario, fija vencimiento y abre el saldo. Con
  // `payment: { method }` se registra el cobro completo en el mismo paso
  // (venta de contado). Si rebasa el límite de crédito, 409 salvo `force`.
  router.post("/sales/:id/deliver", validateObjectIdParam("id"), loadSale, async (req, res) => {
    try {
      const p = req.body || {};
      if (req.sale.status !== "draft") return sendError(res, 409, "WHOLESALE_SALE_NOT_DRAFT", "La venta ya fue entregada o cancelada.");
      const deliveredAt = parseDate(p.deliveredAt, new Date());
      if (deliveredAt === undefined) return sendError(res, 400, "VALIDATION_ERROR", "La fecha de entrega no es válida.");
      const payNow = p.payment && typeof p.payment === "object";
      if (payNow && !PAYMENT_METHODS.includes(p.payment.method)) return sendError(res, 400, "VALIDATION_ERROR", "Elige la forma de pago.");

      const customer = await Customer.findById(req.sale.customer).lean();
      if (!customer) return sendError(res, 404, "WHOLESALE_CUSTOMER_NOT_FOUND", "Cliente mayorista no encontrado.");
      if (!payNow && customer.creditLimit !== null && customer.creditLimit !== undefined && !p.force) {
        const current = (await balancesByCustomer([customer._id])).get(String(customer._id))?.balance || 0;
        if (current + req.sale.total > customer.creditLimit + 0.004) {
          return sendError(
            res,
            409,
            "CREDIT_LIMIT_EXCEEDED",
            `Con esta venta el saldo de ${customer.businessName} quedaría en $${round2(current + req.sale.total)}, arriba de su límite de crédito de $${customer.creditLimit}.`
          );
        }
      }

      const payments = payNow && req.sale.total > 0
        ? [{ amount: req.sale.total, paidAt: deliveredAt, method: p.payment.method, note: asTrimmedString(p.payment.note).slice(0, 300), by: req.user?.id || null }]
        : [];
      const amountPaid = round2(payments.reduce((s, x) => s + x.amount, 0));
      // Cambio de estado atómico: dos clics a la vez no descuentan dos veces.
      const sale = await Sale.findOneAndUpdate(
        { _id: req.sale._id, status: "draft" },
        {
          $set: {
            status: "delivered",
            deliveredAt,
            dueDate: new Date(+deliveredAt + (customer.creditDays || 0) * DAY),
            customerName: customer.businessName,
            amountPaid,
            balance: round2(req.sale.total - amountPaid),
            paymentStatus: paymentStatusOf(req.sale.total, amountPaid),
          },
          $push: { payments: { $each: payments } },
        },
        { new: true }
      );
      if (!sale) return sendError(res, 409, "WHOLESALE_SALE_NOT_DRAFT", "La venta ya fue entregada o cancelada.");
      await adjustStock(
        mongooseConnection,
        sale.items.map((i) => ({ product: i.product, variant: i.variant, delta: -i.quantity })),
        { reason: "wholesale_sale", refKind: "WholesaleSale", refId: sale._id, refLabel: `Mayoreo #${sale.folio}`, by: req.user?.id || null }
      );
      return res.status(200).json({ message: "Venta entregada.", sale: saleResponse(sale) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al entregar la venta.");
    }
  });

  router.post("/sales/:id/cancel", validateObjectIdParam("id"), loadSale, async (req, res) => {
    try {
      if (req.sale.status === "cancelled") return sendError(res, 409, "WHOLESALE_SALE_CANCELLED", "La venta ya está cancelada.");
      if (req.sale.payments.length > 0) {
        return sendError(res, 409, "WHOLESALE_SALE_HAS_PAYMENTS", "La venta tiene abonos: bórralos primero si de verdad se cancela.");
      }
      const wasDelivered = req.sale.status === "delivered";
      const sale = await Sale.findOneAndUpdate(
        { _id: req.sale._id, status: req.sale.status, "payments.0": { $exists: false } },
        { $set: { status: "cancelled", cancelledAt: new Date(), balance: 0 } },
        { new: true }
      );
      if (!sale) return sendError(res, 409, "WHOLESALE_SALE_CHANGED", "La venta cambió mientras tanto; recarga e intenta de nuevo.");
      if (wasDelivered) {
        await adjustStock(
          mongooseConnection,
          sale.items.map((i) => ({ product: i.product, variant: i.variant, delta: i.quantity })),
          { reason: "wholesale_cancel", refKind: "WholesaleSale", refId: sale._id, refLabel: `Mayoreo #${sale.folio}`, note: asTrimmedString(req.body?.reason).slice(0, 300), by: req.user?.id || null }
        );
      }
      return res.status(200).json({ message: "Venta cancelada.", sale: saleResponse(sale) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al cancelar la venta.");
    }
  });

  // Recalcula amountPaid/balance/paymentStatus a partir de los abonos.
  const refreshPaymentTotals = async (saleId) => {
    const sale = await Sale.findById(saleId);
    if (!sale) return null;
    sale.amountPaid = round2(sale.payments.reduce((s, x) => s + x.amount, 0));
    sale.balance = round2(sale.total - sale.amountPaid);
    sale.paymentStatus = paymentStatusOf(sale.total, sale.amountPaid);
    await sale.save();
    return sale;
  };

  router.post("/sales/:id/payments", validateObjectIdParam("id"), loadSale, async (req, res) => {
    try {
      const p = req.body || {};
      if (req.sale.status !== "delivered") return sendError(res, 409, "WHOLESALE_SALE_NOT_DELIVERED", "Solo se registran abonos de ventas entregadas.");
      const amount = parseMoney(p.amount, "El monto");
      if (amount.error || amount.value <= 0) return sendError(res, 400, "VALIDATION_ERROR", amount.error || "El monto debe ser mayor a 0.");
      const paidAt = parseDate(p.paidAt, new Date());
      if (paidAt === undefined) return sendError(res, 400, "VALIDATION_ERROR", "La fecha del abono no es válida.");
      const method = PAYMENT_METHODS.includes(p.method) ? p.method : "transfer";
      // Condicionado al saldo: dos abonos a la vez no dejan saldo negativo.
      const updated = await Sale.findOneAndUpdate(
        { _id: req.sale._id, status: "delivered", balance: { $gte: amount.value - 0.004 } },
        {
          $push: { payments: { amount: amount.value, paidAt, method, note: asTrimmedString(p.note).slice(0, 300), by: req.user?.id || null } },
          $inc: { balance: -amount.value, amountPaid: amount.value },
        },
        { new: true }
      );
      if (!updated) {
        return sendError(res, 409, "PAYMENT_EXCEEDS_BALANCE", `El abono es mayor al saldo pendiente ($${round2(req.sale.balance)}).`);
      }
      const sale = await refreshPaymentTotals(updated._id);
      return res.status(201).json({ message: "Abono registrado.", sale: saleResponse(sale) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al registrar el abono.");
    }
  });

  router.delete("/sales/:id/payments/:paymentId", validateObjectIdParam("id"), validateObjectIdParam("paymentId"), loadSale, async (req, res) => {
    try {
      const payment = req.sale.payments.id(req.params.paymentId);
      if (!payment) return sendError(res, 404, "PAYMENT_NOT_FOUND", "Abono no encontrado.");
      await Sale.updateOne({ _id: req.sale._id }, { $pull: { payments: { _id: payment._id } } });
      const sale = await refreshPaymentTotals(req.sale._id);
      return res.status(200).json({ message: "Abono eliminado.", sale: saleResponse(sale) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el abono.");
    }
  });

  // Cuentas por cobrar: saldo por cliente con antigüedad respecto al
  // vencimiento (al corriente, 1-30, 31-60, más de 60 días vencido).
  router.get("/receivables", async (req, res) => {
    try {
      const sales = await Sale.find({ status: "delivered", balance: { $gt: 0.004 } })
        .select("folio customer customerName total balance deliveredAt dueDate paymentStatus")
        .sort({ dueDate: 1 })
        .lean();
      const now = Date.now();
      const byCustomer = new Map();
      const totals = { balance: 0, current: 0, d1_30: 0, d31_60: 0, d61plus: 0 };
      for (const sale of sales) {
        const daysLate = sale.dueDate ? Math.floor((now - +new Date(sale.dueDate)) / DAY) : 0;
        const bucket = daysLate <= 0 ? "current" : daysLate <= 30 ? "d1_30" : daysLate <= 60 ? "d31_60" : "d61plus";
        const key = String(sale.customer);
        const row = byCustomer.get(key) || { customer: sale.customer, customerName: sale.customerName, balance: 0, current: 0, d1_30: 0, d31_60: 0, d61plus: 0, sales: [] };
        row.balance = round2(row.balance + sale.balance);
        row[bucket] = round2(row[bucket] + sale.balance);
        row.sales.push({ ...sale, daysLate: Math.max(0, daysLate) });
        byCustomer.set(key, row);
        totals.balance = round2(totals.balance + sale.balance);
        totals[bucket] = round2(totals[bucket] + sale.balance);
      }
      const customers = [...byCustomer.values()].sort((a, b) => b.balance - a.balance);
      return res.status(200).json({ totals, customers });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al calcular las cuentas por cobrar.");
    }
  });

  app.use("/api/wholesale", router);
}

module.exports = {
  name: "wholesale",
  registerRoutes,
  models: { WholesaleCustomer: wholesaleCustomerSchema, WholesaleSale: wholesaleSaleSchema },
  PAYMENT_METHODS,
};
