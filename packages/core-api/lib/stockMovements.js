// Movimientos de inventario: único camino para cambiar Inventory.quantity
// fuera del CRUD de modules/inventory.js. Cada ajuste es un $inc atómico,
// nunca deja el stock en negativo (se recorta a 0), recalcula el estado y deja
// un renglón en InventoryMovement (el historial que ve el panel). Lo usan
// pedidos (modules/orders.js), mayoreo (modules/wholesale.js) y compras
// (modules/storeAccounting.js); el CRUD de inventario registra sus propios
// movimientos (initial / manual_adjust) con recordMovement.
const mongoose = require("mongoose");
const { getOrCreateModel } = require("./moduleHelpers");
const { findVariant, variantLabel } = require("./variants");
const { sendMail } = require("./mailer");
const { lowStockEmailTemplate } = require("./emailTemplates");

const MOVEMENT_REASONS = [
  "initial", // alta del registro de inventario
  "manual_adjust", // edición a mano en Inventario
  "order", // pedido pagado/confirmado
  "order_release", // pedido cancelado, regresado a pendiente o borrado
  "wholesale_sale", // venta de mayoreo entregada
  "wholesale_cancel", // venta de mayoreo cancelada
  "purchase", // compra a proveedor recibida
  "purchase_cancel", // compra recibida que se cancela
];

const inventoryMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Cambio aplicado de verdad (si se recortó a 0, el delta real es menor).
    delta: { type: Number, required: true },
    quantityAfter: { type: Number, default: 0 },
    reason: { type: String, enum: MOVEMENT_REASONS, required: true },
    // Origen: "Order" / "WholesaleSale" / "Purchase" + su id y folio legible.
    refKind: { type: String, trim: true, default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    refLabel: { type: String, trim: true, maxlength: 80, default: "" },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
inventoryMovementSchema.index({ product: 1, variant: 1, createdAt: -1 });
inventoryMovementSchema.index({ createdAt: -1 });
inventoryMovementSchema.index({ refKind: 1, refId: 1 });

const getMovementModel = (connection) => getOrCreateModel(connection, "InventoryMovement", inventoryMovementSchema);

const recalculateStatus = (quantity, threshold) => {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= threshold) return "low_stock";
  return "in_stock";
};

// Alertas de inventario (§4.3 del Roadmap de cotizaciones): un correo a la
// tienda cuando un registro EMPEORA de estado (in_stock → low_stock,
// cualquiera → out_of_stock). Reabastecer o volver a guardar sin cambio no
// avisa. `changes`: [{ item, previousStatus }] con item ya guardado; varios
// cambios (p. ej. todos los renglones de un pedido confirmado) van en un solo
// correo. Respeta StoreConfig.lowStockAlerts. Best-effort: nunca lanza.
const STATUS_RANK = { in_stock: 0, low_stock: 1, out_of_stock: 2 };

const notifyStockAlerts = async (mongooseConnection, changes) => {
  try {
    const worsened = changes.filter(({ item, previousStatus }) => STATUS_RANK[item.status] > (STATUS_RANK[previousStatus] ?? 0));
    if (worsened.length === 0) return;

    const { StoreConfig, Product } = mongooseConnection.models;
    const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;
    if (storeConfig?.lowStockAlerts === false) return;
    const to = process.env.CONTACT_EMAIL_TO || process.env.EMAIL_USER;
    if (!to || !Product) return;

    const products = await Product.find({ _id: { $in: worsened.map(({ item }) => item.product) } })
      .select("name sku options variants")
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const items = worsened.map(({ item }) => {
      const product = byId.get(String(item.product)) || {};
      const variant = item.variant ? findVariant(product, item.variant) : null;
      return {
        name: product.name || "Producto",
        variantLabel: variant ? variantLabel(product, variant) : undefined,
        sku: variant?.sku || product.sku,
        quantity: item.quantity,
        threshold: item.lowStockThreshold || 0,
        status: item.status,
      };
    });

    const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
    const logoAbsoluteUrl = backendPublicUrl && storeConfig?.logoUrl
      ? `${backendPublicUrl}/${String(storeConfig.logoUrl).replace(/^\/+/, "")}`
      : undefined;
    const { subject, html, text } = lowStockEmailTemplate({ items, storeConfig, logoAbsoluteUrl });
    await sendMail({ to, subject, text, html });
  } catch (error) {
    console.error("No fue posible enviar la alerta de inventario:", error.message);
  }
};

// Deja un renglón de historial. Best-effort: el historial nunca bloquea el
// cambio de stock que ya se hizo.
const recordMovement = async (connection, { product, variant = null, delta, quantityAfter, reason, refKind = null, refId = null, refLabel = "", note = "", by = null }) => {
  if (!delta) return;
  try {
    await getMovementModel(connection).create({ product, variant: variant || null, delta, quantityAfter, reason, refKind, refId, refLabel, note, by });
  } catch (error) {
    console.error(`No fue posible registrar el movimiento de inventario del producto ${product}:`, error.message);
  }
};

// Ajusta varias líneas [{ product, variant, delta }] con los mismos datos de
// origen (`meta`: reason, refKind, refId, refLabel, note, by). Una línea sin
// registro de inventario se ignora, salvo con `createIfMissing` (compras: lo
// que entra al almacén da de alta el registro). Un solo correo de alerta con
// todo lo que empeoró. Nunca lanza: devuelve los registros ajustados.
const adjustStock = async (connection, lines, meta, { createIfMissing = false } = {}) => {
  const Inventory = connection.models.Inventory;
  if (!Inventory) return [];

  const changes = [];
  for (const line of lines) {
    if (!line.delta) continue;
    try {
      const filter = { product: line.product, variant: line.variant || null };
      let updated = await Inventory.findOneAndUpdate(filter, { $inc: { quantity: line.delta } }, { new: true });
      if (!updated && createIfMissing && line.delta > 0) {
        try {
          updated = await Inventory.create({ ...filter, quantity: line.delta, status: recalculateStatus(line.delta, 0) });
        } catch (error) {
          // Otro request lo creó a la vez: se reintenta como $inc.
          if (error?.code !== 11000) throw error;
          updated = await Inventory.findOneAndUpdate(filter, { $inc: { quantity: line.delta } }, { new: true });
        }
      }
      if (!updated) continue;

      // Nunca queda en negativo: si se vendió más de lo que había, se recorta
      // a 0 en vez de mostrar un stock imposible (y el historial guarda el
      // delta que sí se aplicó).
      const clampedQuantity = Math.max(0, updated.quantity);
      const appliedDelta = line.delta + (clampedQuantity - updated.quantity);
      const status = recalculateStatus(clampedQuantity, updated.lowStockThreshold || 0);
      const previousStatus = updated.status;
      if (clampedQuantity !== updated.quantity || status !== updated.status) {
        updated.quantity = clampedQuantity;
        updated.status = status;
        await updated.save();
      }
      changes.push({ item: updated, previousStatus });
      await recordMovement(connection, { ...meta, product: line.product, variant: line.variant, delta: appliedDelta, quantityAfter: clampedQuantity });
    } catch (error) {
      console.error(`No fue posible ajustar el inventario del producto ${line.product}:`, error.message);
    }
  }
  // Sin await: no retrasa la respuesta.
  notifyStockAlerts(connection, changes);
  return changes.map(({ item }) => item);
};

module.exports = {
  MOVEMENT_REASONS,
  inventoryMovementSchema,
  getMovementModel,
  recalculateStatus,
  notifyStockAlerts,
  recordMovement,
  adjustStock,
};
