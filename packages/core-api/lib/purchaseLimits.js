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

module.exports = { getPurchaseLimit };
