// src/utils/price.js
//
// Ahorro de un producto: diferencia entre el precio anterior (compareAtPrice)
// y el actual, solo si el anterior es mayor. 0 si no hay descuento.
export const savingOf = (product) =>
  product?.compareAtPrice > product?.price ? product.compareAtPrice - product.price : 0;
