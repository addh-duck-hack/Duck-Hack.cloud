// Variantes de producto (talla, color, presentación…). Un producto sin
// `options` no tiene variantes y se comporta como siempre: un solo precio y un
// solo registro de inventario (Inventory.variant = null). Con `options`, cada
// combinación vendible es una entrada de `variants` con su propio SKU,
// existencias (Inventory.variant = variant._id) y, opcionalmente, precio e
// imagen — si no trae precio hereda el del producto.
//
// Lo usan modules/products.js (validación), lib/purchaseLimits.js#filterInStock
// (catálogo público), modules/inventory.js y modules/orders.js (precio y stock
// por variante).

const MAX_OPTIONS = 3;
const MAX_OPTION_NAME = 40;
const MAX_OPTION_VALUES = 50;
const MAX_OPTION_VALUE = 60;
const MAX_VARIANTS = 100;
const MAX_VARIANT_SKU = 60;

const hasVariants = (product) => Array.isArray(product?.options) && product.options.length > 0;

const findVariant = (product, variantId) =>
  (product?.variants || []).find((v) => String(v._id) === String(variantId)) || null;

// "Talla: M / Color: Rojo" — snapshot que se guarda en el pedido.
const variantLabel = (product, variant) =>
  (product?.options || [])
    .map((option, i) => `${option.name}: ${variant?.optionValues?.[i] ?? ""}`)
    .join(" / ");

// Precio efectivo: el de la variante si lo tiene; si no, el del producto (y
// entonces también su precio comparativo).
const variantPricing = (product, variant) => {
  const ownPrice = variant && variant.price !== undefined && variant.price !== null;
  return {
    price: ownPrice ? variant.price : product.price,
    compareAtPrice: ownPrice ? variant.compareAtPrice : product.compareAtPrice,
  };
};

// Clave de inventario: un registro por producto (sin variantes) o por
// producto + variante.
const stockKey = (productId, variantId) => `${productId}:${variantId || ""}`;

const asText = (value) => (typeof value === "string" ? value.trim() : "");

// Normaliza `options` del payload. Devuelve { value } o { error }.
const normalizeOptions = (raw) => {
  if (!Array.isArray(raw)) return { error: "options debe ser un arreglo." };
  if (raw.length > MAX_OPTIONS) return { error: `options admite máximo ${MAX_OPTIONS} opciones.` };
  const seenNames = new Set();
  const options = [];
  for (const [index, item] of raw.entries()) {
    const name = asText(item?.name);
    if (!name) return { error: `options[${index}] necesita nombre.` };
    if (name.length > MAX_OPTION_NAME) return { error: `options[${index}].name excede ${MAX_OPTION_NAME} caracteres.` };
    if (seenNames.has(name.toLowerCase())) return { error: `La opción "${name}" está repetida.` };
    seenNames.add(name.toLowerCase());

    const values = [];
    const seenValues = new Set();
    for (const rawValue of Array.isArray(item?.values) ? item.values : []) {
      const value = asText(rawValue);
      if (!value || seenValues.has(value.toLowerCase())) continue;
      if (value.length > MAX_OPTION_VALUE) return { error: `El valor "${value.slice(0, 20)}…" de "${name}" excede ${MAX_OPTION_VALUE} caracteres.` };
      seenValues.add(value.toLowerCase());
      values.push(value);
    }
    if (values.length === 0) return { error: `La opción "${name}" necesita al menos un valor.` };
    if (values.length > MAX_OPTION_VALUES) return { error: `La opción "${name}" admite máximo ${MAX_OPTION_VALUES} valores.` };
    options.push({ name, values });
  }
  return { value: options };
};

const asOptionalPrice = (value) => {
  if (value === undefined || value === null || value === "") return { value: undefined };
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return { error: true };
  return { value: num };
};

// Normaliza `variants` del payload (forma de cada fila). La congruencia con
// `options` se revisa aparte en validateVariants, con los valores ya mezclados
// con lo guardado (en un PUT puede llegar solo uno de los dos).
const normalizeVariants = (raw, isValidObjectId) => {
  if (!Array.isArray(raw)) return { error: "variants debe ser un arreglo." };
  if (raw.length > MAX_VARIANTS) return { error: `variants admite máximo ${MAX_VARIANTS} variantes.` };
  const variants = [];
  for (const [index, item] of raw.entries()) {
    const sku = asText(item?.sku).toUpperCase();
    if (!sku) return { error: `variants[${index}] necesita SKU.` };
    if (sku.length > MAX_VARIANT_SKU) return { error: `variants[${index}].sku excede ${MAX_VARIANT_SKU} caracteres.` };
    const price = asOptionalPrice(item?.price);
    if (price.error) return { error: `variants[${index}].price debe ser un número >= 0.` };
    const compareAtPrice = asOptionalPrice(item?.compareAtPrice);
    if (compareAtPrice.error) return { error: `variants[${index}].compareAtPrice debe ser un número >= 0.` };

    const variant = {
      sku,
      optionValues: (Array.isArray(item?.optionValues) ? item.optionValues : []).map(asText),
      price: price.value,
      compareAtPrice: compareAtPrice.value,
      image: asText(item?.image) || undefined,
      isActive: item?.isActive === undefined ? true : Boolean(item.isActive),
    };
    // Conservar el _id es lo que mantiene ligados el inventario y los pedidos
    // de la variante al editar el producto.
    if (item?._id && isValidObjectId(item._id)) variant._id = item._id;
    variants.push(variant);
  }
  return { value: variants };
};

// Revisa variantes contra opciones: cada variante elige exactamente un valor
// existente de cada opción, sin combinaciones ni SKUs repetidos. Devuelve un
// mensaje de error o null.
const validateVariants = (options, variants, productSku) => {
  if (options.length === 0) {
    return variants.length > 0 ? "Un producto sin opciones no puede tener variantes." : null;
  }
  if (variants.length === 0) return "Agrega al menos una variante (o quita las opciones).";

  const seenCombos = new Set();
  const seenSkus = new Set([String(productSku || "").toUpperCase()]);
  for (const variant of variants) {
    if (variant.optionValues.length !== options.length) {
      return `La variante ${variant.sku} debe elegir un valor de cada opción (${options.map((o) => o.name).join(", ")}).`;
    }
    for (const [i, option] of options.entries()) {
      if (!option.values.includes(variant.optionValues[i])) {
        return `La variante ${variant.sku} usa "${variant.optionValues[i]}", que no es un valor de "${option.name}".`;
      }
    }
    const combo = variant.optionValues.join("\u0000");
    if (seenCombos.has(combo)) return `La combinación ${variant.optionValues.join(" / ")} está repetida.`;
    seenCombos.add(combo);
    if (seenSkus.has(variant.sku)) return `El SKU ${variant.sku} está repetido (entre variantes o con el del producto).`;
    seenSkus.add(variant.sku);
  }
  return null;
};

module.exports = {
  MAX_OPTIONS,
  MAX_VARIANTS,
  hasVariants,
  findVariant,
  variantLabel,
  variantPricing,
  stockKey,
  normalizeOptions,
  normalizeVariants,
  validateVariants,
};
