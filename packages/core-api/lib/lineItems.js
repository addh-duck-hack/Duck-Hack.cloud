// Renglones de producto para documentos internos (ventas de mayoreo, compras a
// proveedor): valida producto + variante contra el catálogo y devuelve el
// snapshot (nombre, etiqueta de variante, precio de lista) que se guarda en el
// documento, igual que hace Order con sus items.
const { asFiniteNumber, isValidObjectId } = require("./moduleHelpers");
const { hasVariants, findVariant, variantLabel, variantPricing } = require("./variants");

const MAX_LINES = 200;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Carga los productos referenciados por `rawLines` de una vez.
const loadProducts = async (connection, rawLines) => {
  const Product = connection.models.Product;
  const ids = [...new Set(rawLines.map((l) => l?.product).filter((id) => isValidObjectId(id)).map(String))];
  if (!Product || ids.length === 0) return new Map();
  const products = await Product.find({ _id: { $in: ids } }).select("name sku price compareAtPrice options variants").lean();
  return new Map(products.map((p) => [String(p._id), p]));
};

// Un renglón con producto: { product, variant } → { value: { product,
// variant, productName, variantLabel, sku, listPrice } } o { error }.
const resolveProductLine = (productsById, raw, index) => {
  if (!isValidObjectId(raw?.product)) return { error: `El renglón ${index + 1} necesita un producto válido.` };
  const product = productsById.get(String(raw.product));
  if (!product) return { error: `El producto del renglón ${index + 1} ya no existe.` };
  const wantsVariant = raw.variant !== undefined && raw.variant !== null && raw.variant !== "";
  if (hasVariants(product) && !wantsVariant) return { error: `"${product.name}" tiene variantes: elige una en el renglón ${index + 1}.` };
  if (!hasVariants(product) && wantsVariant) return { error: `"${product.name}" no tiene variantes.` };
  const variant = wantsVariant ? findVariant(product, raw.variant) : null;
  if (wantsVariant && !variant) return { error: `La variante del renglón ${index + 1} ya no existe en "${product.name}".` };
  return {
    value: {
      product: product._id,
      variant: variant ? variant._id : null,
      productName: product.name,
      variantLabel: variant ? variantLabel(product, variant) : "",
      sku: variant?.sku || product.sku || "",
      listPrice: variantPricing(product, variant).price || 0,
    },
  };
};

// Cantidad > 0 (admite decimales: kilos de café, litros…).
const parseQuantity = (value, index) => {
  const quantity = asFiniteNumber(value);
  if (quantity === null || quantity <= 0 || quantity > 1e6) return { error: `La cantidad del renglón ${index + 1} debe ser mayor a 0.` };
  return { value: Math.round(quantity * 1000) / 1000 };
};

const parseMoney = (value, label) => {
  const amount = asFiniteNumber(value);
  if (amount === null || amount < 0 || amount > 1e9) return { error: `${label} debe ser un número mayor o igual a 0.` };
  return { value: round2(amount) };
};

module.exports = { MAX_LINES, round2, loadProducts, resolveProductLine, parseQuantity, parseMoney };
