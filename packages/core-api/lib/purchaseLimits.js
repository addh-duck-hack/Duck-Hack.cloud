const { sanitizeDoc } = require("./moduleHelpers");

// Tope de piezas de un mismo producto por pedido en el storefront público.
// Lo configura el admin en StoreConfig.maxUnitsPerProduct (pestaña "Pagos y
// ventas"); vacío o 0 = sin tope, y entonces solo limita el inventario. Arriba
// del tope la tienda atiende como venta de mayoreo por contacto directo. Lo
// usan GET /api/products/public (`maxQty`/`purchaseLimit`) y
// POST /api/orders/public (validación). Las ventas manuales de staff
// (POST /api/orders) nunca tienen tope.
//
// Devuelve un entero > 0, o null si no hay tope (o si StoreConfig no está
// montado / aún no existe el documento).
const getPurchaseLimit = async (mongooseConnection) => {
  const StoreConfig = mongooseConnection.models.StoreConfig;
  if (!StoreConfig) return null;
  const config = await StoreConfig.findOne({ singletonKey: "default" }).select("maxUnitsPerProduct").lean();
  const limit = Number(config?.maxUnitsPerProduct);
  return Number.isInteger(limit) && limit > 0 ? limit : null;
};

// Solo se muestran productos con inventario cargado y quantity > 0 — un
// producto sin registro de inventario (nunca se le dio de alta stock) se
// considera sin existencias, no "ilimitado" (decisión explícita del
// negocio). Usado por GET /api/products/public y /public/:id (modules/products.js) y
// por los carruseles de GET /api/app-home/public (modules/appHome.js) — las rutas
// de staff siguen viendo el catálogo completo para poder gestionarlo.
// Devuelve los productos ya sanitizados y con `maxQty`/`purchaseLimit`.
const filterInStock = async (Inventory, products, purchaseLimit) => {
  if (!Inventory || products.length === 0) return [];
  const ids = products.map((p) => p._id);
  const stocked = await Inventory.find({ product: { $in: ids }, quantity: { $gt: 0 } })
    .select("product quantity")
    .lean();
  const stockById = new Map(stocked.map((i) => [String(i.product), i.quantity]));
  return products
    .filter((p) => stockById.has(String(p._id)))
    .map((p) => {
      const stock = Math.floor(stockById.get(String(p._id)));
      return {
        ...sanitizeDoc(p),
        maxQty: purchaseLimit ? Math.min(stock, purchaseLimit) : stock,
        purchaseLimit,
      };
    });
};

module.exports = { getPurchaseLimit, filterInStock };
