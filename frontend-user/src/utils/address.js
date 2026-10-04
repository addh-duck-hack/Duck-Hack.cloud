// src/utils/address.js
//
// Forma de una dirección de envío, compartida entre el checkout
// (useCheckout.js) y la libreta de "Mi cuenta" (useAccount.js). Los campos
// son los mismos que Order.shippingAddress (packages/core-api/modules/orders.js)
// y User.addresses (modules/auth.js), así una dirección guardada se copia tal
// cual al pedido con pickShippingAddress.

// Metadatos de cada campo, en orden de captura. La UI puede iterar esta lista
// para pintar el formulario en vez de repetir 9 inputs a mano. `wide` es solo
// una pista de maquetación (el campo ocupa toda la fila).
export const SHIPPING_ADDRESS_FIELDS = [
  { name: 'recipientName', label: 'Nombre de quien recibe', placeholder: 'María Fernanda Ruiz', maxLength: 200, required: true },
  { name: 'phone', label: 'Teléfono', placeholder: '55 1234 5678', maxLength: 40, required: true },
  { name: 'street', label: 'Calle', placeholder: 'Av. Reforma', maxLength: 200, required: true, wide: true },
  { name: 'exteriorNumber', label: 'Número exterior', placeholder: '123', maxLength: 20, required: true },
  { name: 'interiorNumber', label: 'Número interior (opcional)', placeholder: 'Depto. 4', maxLength: 20, required: false },
  { name: 'zipCode', label: 'Código postal', placeholder: '73080', maxLength: 10, required: true },
  { name: 'neighborhood', label: 'Colonia', placeholder: 'Centro', maxLength: 120, required: true },
  { name: 'city', label: 'Ciudad', placeholder: 'Xicotepec de Juárez', maxLength: 120, required: true },
  { name: 'state', label: 'Estado', placeholder: 'Puebla', maxLength: 120, required: true },
];

export const EMPTY_SHIPPING_ADDRESS = Object.fromEntries(SHIPPING_ADDRESS_FIELDS.map((f) => [f.name, '']));

// Entrada de la libreta de direcciones: los mismos campos + `label` e
// `isDefault`, que son propios de la libreta y no existen en el pedido.
export const EMPTY_SAVED_ADDRESS = { label: '', ...EMPTY_SHIPPING_ADDRESS, isDefault: false };

// Extrae solo los campos de envío de un objeto más grande (una entrada de
// User.addresses trae también _id/label/isDefault, que no aplican al pedido).
export const pickShippingAddress = (addr) => {
  if (!addr) return null;
  return Object.fromEntries(Object.keys(EMPTY_SHIPPING_ADDRESS).map((field) => [field, addr[field] || '']));
};

// Dirección guardada -> valores del formulario de edición de la libreta.
export const savedAddressToForm = (addr) => ({
  ...EMPTY_SAVED_ADDRESS,
  ...pickShippingAddress(addr),
  label: addr?.label || '',
  isDefault: Boolean(addr?.isDefault),
});

// Handler genérico de onChange para formularios de dirección (soporta el
// checkbox isDefault).
export const readFieldChange = (e) => {
  const { name, value, type, checked } = e.target;
  return [name, type === 'checkbox' ? checked : value];
};
