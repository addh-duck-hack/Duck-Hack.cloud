import React from "react";

// Opciones (Talla, Color…) y variantes vendibles del producto — ver
// packages/core-api/lib/variants.js. Sin opciones el producto no tiene
// variantes y se vende como siempre. Con opciones, cada combinación es una
// variante con su SKU, inventario propio (se registra en Inventario) y,
// opcionalmente, precio e imagen; si no trae precio usa el del producto.
//
// Los valores de cada opción se capturan separados por coma y se guardan
// tal cual mientras se edita (el recorte y las vacías se limpian al guardar,
// en ProductForm#toVariantsPayload) para no "comerse" el espacio al escribir.

const MAX_OPTIONS = 3;
const MAX_VARIANTS = 100;

const cleanValues = (values) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];

const skuPart = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);

// Todas las combinaciones de valores, en el orden de las opciones.
const combinations = (options) =>
  options.reduce((acc, option) => acc.flatMap((combo) => cleanValues(option.values).map((v) => [...combo, v])), [[]]);

const comboKey = (values) => values.join("\u0000");

export const emptyVariant = (optionValues, productSku) => ({
  sku: [productSku || "SKU", ...optionValues.map(skuPart)].filter(Boolean).join("-"),
  optionValues,
  price: "",
  compareAtPrice: "",
  image: "",
  isActive: true,
});

const ProductVariantsEditor = ({ options, variants, onChange, productSku, productPrice, productImages = [] }) => {
  const setOptions = (nextOptions) => onChange({ options: nextOptions, variants });
  const setVariants = (nextVariants) => onChange({ options, variants: nextVariants });

  const updateOption = (index, patch) => setOptions(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const addOption = () => options.length < MAX_OPTIONS && setOptions([...options, { name: "", values: [] }]);
  // Quitar una opción invalida todas las variantes: se limpian (el backend
  // pediría volver a generarlas de todos modos).
  const removeOption = (index) => {
    if (variants.length > 0 && !window.confirm("Quitar la opción borra las variantes actuales. ¿Continuar?")) return;
    onChange({ options: options.filter((_, i) => i !== index), variants: [] });
  };

  const updateVariant = (index, patch) => setVariants(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  const removeVariant = (index) => setVariants(variants.filter((_, i) => i !== index));

  const optionValueSets = options.map((o) => new Set(cleanValues(o.values)));
  const isValidVariant = (variant) =>
    variant.optionValues.length === options.length && variant.optionValues.every((value, i) => optionValueSets[i]?.has(value));

  const generate = () => {
    const existing = new Set(variants.map((v) => comboKey(v.optionValues)));
    const missing = combinations(options)
      .filter((combo) => combo.length === options.length && !existing.has(comboKey(combo)))
      .map((combo) => emptyVariant(combo, productSku));
    if (variants.length + missing.length > MAX_VARIANTS) {
      window.alert(`Máximo ${MAX_VARIANTS} variantes por producto.`);
      return;
    }
    setVariants([...variants, ...missing]);
  };

  const smallButton = { width: "auto", padding: "0.35rem 0.6rem", margin: 0 };
  const cellInput = { marginBottom: 0, minWidth: 0 };

  return (
    <fieldset style={{ border: "1px solid var(--input-border-color)", borderRadius: 8, padding: "0.75rem 1rem", margin: "0.75rem 0" }}>
      <legend style={{ padding: "0 0.35rem" }}>Variantes (opcional)</legend>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", opacity: 0.8 }}>
        Lo que el cliente elige al comprar (ej. Talla → S, M, L · Color → Rojo, Azul). Cada combinación lleva su SKU y su
        inventario. Si dejas el precio vacío se usa el del producto.
      </p>

      {options.map((option, index) => (
        <div
          key={index}
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 2fr) auto", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}
        >
          <input
            type="text"
            aria-label={`Nombre de la opción ${index + 1}`}
            placeholder="Opción (ej. Talla)"
            maxLength={40}
            value={option.name}
            onChange={(e) => updateOption(index, { name: e.target.value })}
            style={cellInput}
          />
          <input
            type="text"
            aria-label={`Valores de la opción ${index + 1}`}
            placeholder="Valores separados por coma (ej. S, M, L)"
            value={option.values.join(",")}
            onChange={(e) => updateOption(index, { values: e.target.value.split(",") })}
            style={cellInput}
          />
          <button type="button" className="btn-secondary" style={smallButton} onClick={() => removeOption(index)} aria-label="Quitar opción">
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: variants.length ? "0.75rem" : 0 }}>
        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={addOption} disabled={options.length >= MAX_OPTIONS}>
          <i className="fas fa-plus" aria-hidden="true" /> Agregar opción
        </button>
        {options.length > 0 ? (
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={generate}>
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Generar combinaciones faltantes
          </button>
        ) : null}
      </div>

      {variants.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Variante</th>
                <th>SKU</th>
                <th>Precio</th>
                <th>Precio comparativo</th>
                <th>Imagen</th>
                <th>Activa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant, index) => {
                const valid = isValidVariant(variant);
                return (
                  <tr key={variant._id || comboKey(variant.optionValues) || index}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {variant.optionValues.join(" / ") || "—"}
                      {!valid ? (
                        <span className="badge badge-red" style={{ marginLeft: "0.4rem" }} title="Ya no coincide con las opciones: quítala o corrige las opciones">
                          No coincide
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <input
                        type="text"
                        aria-label="SKU de la variante"
                        value={variant.sku}
                        maxLength={60}
                        onChange={(e) => updateVariant(index, { sku: e.target.value })}
                        required
                        style={{ ...cellInput, width: 150 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        aria-label="Precio de la variante"
                        min="0"
                        step="0.01"
                        placeholder={productPrice !== "" ? String(productPrice) : ""}
                        value={variant.price}
                        onChange={(e) => updateVariant(index, { price: e.target.value })}
                        style={{ ...cellInput, width: 100 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        aria-label="Precio comparativo de la variante"
                        min="0"
                        step="0.01"
                        value={variant.compareAtPrice}
                        onChange={(e) => updateVariant(index, { compareAtPrice: e.target.value })}
                        disabled={variant.price === ""}
                        title={variant.price === "" ? "Usa el del producto mientras no tenga precio propio" : undefined}
                        style={{ ...cellInput, width: 100 }}
                      />
                    </td>
                    <td>
                      <select
                        aria-label="Imagen de la variante"
                        value={variant.image || ""}
                        onChange={(e) => updateVariant(index, { image: e.target.value })}
                        style={{ ...cellInput, width: 140 }}
                      >
                        <option value="">La del producto</option>
                        {productImages.map((image, i) => (
                          <option key={image} value={image}>
                            Imagen {i + 1}
                          </option>
                        ))}
                        {variant.image && !productImages.includes(variant.image) ? <option value={variant.image}>(otra)</option> : null}
                      </select>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        aria-label="Variante activa"
                        checked={variant.isActive !== false}
                        onChange={(e) => updateVariant(index, { isActive: e.target.checked })}
                        style={{ width: "auto" }}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn-secondary" style={smallButton} onClick={() => removeVariant(index)} aria-label="Quitar variante">
                        <i className="fas fa-trash" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <small>
            Una variante con inventario registrado no se puede quitar: desactívala para dejar de venderla. El inventario se
            registra por variante en Inventario.
          </small>
        </div>
      ) : null}
    </fieldset>
  );
};

export default ProductVariantsEditor;
