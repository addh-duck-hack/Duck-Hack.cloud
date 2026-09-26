// Opciones de entrega y pago del checkout público, a partir de StoreConfig
// (el admin las configura en la pestaña "Entrega y pago"):
//
//   - homeDeliveryEnabled: envío a domicilio sí/no (su costo es
//     StoreConfig.shipping, ver lib/shipping.js).
//   - pickupPoints: puntos de venta donde recoger ({ name, address, schedule,
//     instructions, lat, lng, isActive }).
//   - paymentMethods: métodos de pago ({ type, label, description,
//     instructions, forShipping, forPickup, isActive }). `type` decide cómo se
//     cobra: "spei" manda los datos de StoreConfig.speiPayment por correo y
//     "manual" solo las instrucciones que escribió la tienda. Una pasarela de
//     pago se agregaría como un `type` nuevo (PAYMENT_METHOD_TYPES).
//
// Compatibilidad: una tienda que no ha configurado métodos de pago usa
// DEFAULT_PAYMENT_METHODS, con los mismos ids que los paymentMethod de antes
// ("transfer" / "pickup"), y un storefront viejo que manda
// paymentMethod "transfer" | "pickup" sin deliveryMethod sigue funcionando
// (ver resolveCheckout).
const PAYMENT_METHOD_TYPES = ["spei", "manual"];
const DELIVERY_METHODS = ["shipping", "pickup"];

const DEFAULT_PAYMENT_METHODS = [
  {
    _id: "transfer",
    type: "spei",
    label: "Transferencia / SPEI",
    description: "Te enviamos los datos por correo y confirmamos al recibir el pago.",
    instructions: "",
    forShipping: true,
    forPickup: true,
  },
  {
    _id: "pickup",
    type: "manual",
    label: "Pago al recoger",
    description: "Pagas al recoger tu pedido.",
    instructions: "Puedes pasar a recoger y pagar tu pedido; te escribimos para coordinar.",
    forShipping: false,
    forPickup: true,
  },
];

const idOf = (item) => String(item?._id ?? "");
const isActive = (item) => item?.isActive !== false;

const activePickupPoints = (config) => (config?.pickupPoints || []).filter(isActive);

const activePaymentMethods = (config) => {
  const configured = (config?.paymentMethods || []).filter(isActive);
  return configured.length ? configured : (config?.paymentMethods || []).length ? [] : DEFAULT_PAYMENT_METHODS;
};

const appliesTo = (method, deliveryMethod) =>
  deliveryMethod === "pickup" ? method.forPickup !== false : method.forShipping !== false;

// Lo que ve el storefront (GET /api/store-config/public): solo lo activo.
const publicCheckoutOptions = (config) => ({
  homeDeliveryEnabled: config?.homeDeliveryEnabled !== false,
  pickupPoints: activePickupPoints(config).map((p) => ({
    _id: idOf(p),
    name: p.name,
    address: p.address || "",
    schedule: p.schedule || "",
    instructions: p.instructions || "",
    lat: p.lat ?? null,
    lng: p.lng ?? null,
  })),
  paymentMethods: activePaymentMethods(config).map((m) => ({
    _id: idOf(m),
    type: m.type,
    label: m.label,
    description: m.description || "",
    instructions: m.instructions || "",
    forShipping: m.forShipping !== false,
    forPickup: m.forPickup !== false,
  })),
});

const unavailable = (code, message) => ({ error: { status: 400, code, message } });

// Valida la elección del cliente contra la configuración y devuelve lo que se
// guarda en el pedido (snapshots, para que editar la config después no mueva
// pedidos ya hechos), o { error }.
const resolveCheckout = (config, { deliveryMethod, pickupPointId, paymentMethod }) => {
  // Storefront viejo: sin deliveryMethod, "pickup" como método de pago
  // significaba recoger en tienda.
  const delivery = deliveryMethod || (paymentMethod === "pickup" ? "pickup" : "shipping");
  if (!DELIVERY_METHODS.includes(delivery)) {
    return unavailable("VALIDATION_ERROR", `deliveryMethod debe ser uno de: ${DELIVERY_METHODS.join(", ")}.`);
  }

  let pickupPoint;
  if (delivery === "shipping") {
    if (config?.homeDeliveryEnabled === false) {
      return unavailable("DELIVERY_METHOD_UNAVAILABLE", "El envío a domicilio no está disponible en esta tienda.");
    }
  } else {
    const points = activePickupPoints(config);
    if (points.length) {
      const point = points.find((p) => idOf(p) === String(pickupPointId || ""));
      if (!point) {
        return unavailable("PICKUP_POINT_UNAVAILABLE", "Elige un punto de venta disponible para recoger tu pedido.");
      }
      pickupPoint = {
        name: point.name,
        address: point.address || "",
        schedule: point.schedule || "",
        instructions: point.instructions || "",
        lat: point.lat ?? null,
        lng: point.lng ?? null,
      };
    }
    // Sin puntos configurados se acepta "recoger" sin punto (comportamiento
    // anterior: la tienda coordina con el cliente).
  }

  const methods = activePaymentMethods(config).filter((m) => appliesTo(m, delivery));
  const requested = String(paymentMethod || "");
  let method = methods.find((m) => idOf(m) === requested);
  // Ids de antes ("transfer" / "pickup") contra una tienda que ya configuró
  // sus propios métodos: se mapean al primero del tipo equivalente.
  if (!method && requested === "transfer") method = methods.find((m) => m.type === "spei");
  if (!method && requested === "pickup") method = methods.find((m) => m.type === "manual");
  if (!method) {
    return unavailable("PAYMENT_METHOD_UNAVAILABLE", "Elige un método de pago disponible para tu forma de entrega.");
  }

  return {
    deliveryMethod: delivery,
    pickupPoint,
    paymentMethod: idOf(method),
    paymentMethodType: method.type,
    paymentMethodLabel: method.label,
    paymentInstructions: method.instructions || "",
  };
};

module.exports = {
  PAYMENT_METHOD_TYPES,
  DELIVERY_METHODS,
  DEFAULT_PAYMENT_METHODS,
  publicCheckoutOptions,
  resolveCheckout,
};
