const { sanitizeDoc } = require("./moduleHelpers");
const { hasVariants, variantLabel, variantPricing, stockKey } = require("./variants");

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
//
// Con variantes (lib/variants.js) el stock es por variante: el producto se
// muestra si al menos una variante activa tiene existencias, y trae
// `variants` (solo activas) con su precio efectivo, `label`, `inStock` y
// `maxQty` — las agotadas se incluyen con inStock:false para que la tienda
// las muestre como "Agotado". `maxQty` del producto = el mayor de sus
// variantes y `priceRange` = {min, max} de las variantes disponibles.
const filterInStock = async (Inventory, products, purchaseLimit) => {
  if (!Inventory || products.length === 0) return [];
  const ids = products.map((p) => p._id);
  const stocked = await Inventory.find({ product: { $in: ids }, quantity: { $gt: 0 } })
    .select("product variant quantity")
    .lean();
  const stockByKey = new Map(stocked.map((i) => [stockKey(i.product, i.variant), Math.floor(i.quantity)]));
  const capped = (stock) => (purchaseLimit ? Math.min(stock, purchaseLimit) : stock);

  const result = [];
  for (const product of products) {
    if (!hasVariants(product)) {
      const stock = stockByKey.get(stockKey(product._id, null));
      if (!stock) continue;
      result.push({ ...sanitizeDoc(product), maxQty: capped(stock), purchaseLimit });
      continue;
    }

    const variants = (product.variants || [])
      .filter((v) => v.isActive !== false)
      .map((v) => {
        const stock = stockByKey.get(stockKey(product._id, v._id)) || 0;
        return {
          _id: v._id,
          sku: v.sku,
          optionValues: v.optionValues,
          label: variantLabel(product, v),
          ...variantPricing(product, v),
          image: v.image || null,
          inStock: stock > 0,
          maxQty: capped(stock),
        };
      });
    const available = variants.filter((v) => v.inStock);
    if (available.length === 0) continue;
    const prices = available.map((v) => v.price);
    result.push({
      ...sanitizeDoc(product),
      variants,
      maxQty: Math.max(...available.map((v) => v.maxQty)),
      priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
      purchaseLimit,
    });
  }
  return result;
};

module.exports = { getPurchaseLimit, filterInStock };
