import React, { useMemo } from "react";
import { formatMxn } from "../utils/storeFinance";

// Renglones producto/variante/cantidad/precio para ventas de mayoreo
// (WholesaleSaleForm.jsx) y compras (PurchaseForm.jsx). `lines`:
// [{ product, variant, description, quantity, price }]. Con `allowFreeText`
// (compras) un renglón puede no llevar producto, solo descripción (insumos que
// no se venden). `suggestedPrice(product, variant)` = precio que el backend
// pone si el campo queda vacío (se muestra como placeholder).
export const emptyLine = () => ({ product: "", variant: "", description: "", quantity: 1, price: "" });

const hasVariants = (product) => Boolean(product?.options?.length);

const LineItemsEditor = ({ products, lines, onChange, priceLabel = "Precio unitario", allowFreeText = false, suggestedPrice }) => {
  const productsById = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);

  const update = (index, patch) => onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const remove = (index) => onChange(lines.filter((_, i) => i !== index));

  const effectivePrice = (line) => {
    if (line.price !== "" && line.price !== null && line.price !== undefined) return Number(line.price);
    const product = productsById.get(line.product);
    if (!product || !suggestedPrice) return 0;
    const variant = (product.variants || []).find((v) => v._id === line.variant) || null;
    return suggestedPrice(product, variant) || 0;
  };
  const total = lines.reduce((sum, line) => sum + effectivePrice(line) * Number(line.quantity || 0), 0);

  return (
    <div>
      {lines.map((line, index) => {
        const product = productsById.get(line.product);
        const variant = product ? (product.variants || []).find((v) => v._id === line.variant) || null : null;
        const placeholder = product && suggestedPrice ? String(suggestedPrice(product, variant) ?? "") : "";
        return (
          <div key={index} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <label style={{ flex: "2 1 220px", marginBottom: 0 }}>
              Producto
              <select value={line.product} onChange={(e) => update(index, { product: e.target.value, variant: "" })} required={!allowFreeText}>
                <option value="">{allowFreeText ? "— Sin producto (insumo) —" : "Selecciona un producto"}</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ""}
                  </option>
                ))}
              </select>
            </label>
            {hasVariants(product) ? (
              <label style={{ flex: "1.5 1 160px", marginBottom: 0 }}>
                Variante
                <select value={line.variant} onChange={(e) => update(index, { variant: e.target.value })} required>
                  <option value="">Elige una variante</option>
                  {(product.variants || []).map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.optionValues.join(" / ")}
                      {v.sku ? ` (${v.sku})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {allowFreeText ? (
              <label style={{ flex: "2 1 200px", marginBottom: 0 }}>
                Descripción{line.product ? " (opcional)" : ""}
                <input type="text" value={line.description} maxLength={200} onChange={(e) => update(index, { description: e.target.value })} required={!line.product} />
              </label>
            ) : null}
            <label style={{ width: 110, marginBottom: 0 }}>
              Cantidad
              <input type="number" min="0.001" step="any" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} required />
            </label>
            <label style={{ width: 140, marginBottom: 0 }}>
              {priceLabel}
              <input type="number" min="0" step="0.01" value={line.price} placeholder={placeholder} onChange={(e) => update(index, { price: e.target.value })} required={!suggestedPrice} />
            </label>
            <div style={{ minWidth: 110, paddingBottom: "0.6rem" }}>{formatMxn(effectivePrice(line) * Number(line.quantity || 0))}</div>
            {lines.length > 1 ? (
              <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => remove(index)}>
                Quitar
              </button>
            ) : null}
          </div>
        );
      })}
      <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => onChange([...lines, emptyLine()])}>
        Agregar renglón
      </button>
      <p style={{ marginTop: "1rem" }}>
        <strong>Subtotal: {formatMxn(total)}</strong>
      </p>
    </div>
  );
};

export default LineItemsEditor;
