// Costo de envío de un pedido del storefront, según StoreConfig.shipping (lo
// configura el admin en la pestaña "Pagos y ventas"):
//   - enabled: false → los productos no cobran envío.
//   - enabled: true  → se cobra `cost`, salvo que el subtotal de productos
//     (ya con descuentos) llegue a `freeFrom`; sin `freeFrom` nunca es gratis.
// Los pedidos "pickup" (recoge en la tienda) nunca pagan envío. Lo usa
// POST /api/orders/public; el storefront lee lo mismo de
// GET /api/store-config/public para mostrarlo en la canasta.
const shippingSettingsOf = (config) => {
  const shipping = config?.shipping || {};
  const cost = Number(shipping.cost);
  const freeFrom = Number(shipping.freeFrom);
  return {
    enabled: Boolean(shipping.enabled) && cost > 0,
    cost: cost > 0 ? cost : 0,
    freeFrom: freeFrom > 0 ? freeFrom : null,
  };
};

const computeShippingCost = (settings, subtotal, paymentMethod) => {
  if (paymentMethod === "pickup" || !settings.enabled) return 0;
  if (settings.freeFrom && subtotal >= settings.freeFrom) return 0;
  return settings.cost;
};

// null-safe: sin StoreConfig montado o sin documento, no se cobra envío.
const getShippingSettings = async (mongooseConnection) => {
  const StoreConfig = mongooseConnection.models.StoreConfig;
  const config = StoreConfig
    ? await StoreConfig.findOne({ singletonKey: "default" }).select("shipping").lean()
    : null;
  return shippingSettingsOf(config);
};

module.exports = { shippingSettingsOf, computeShippingCost, getShippingSettings };
