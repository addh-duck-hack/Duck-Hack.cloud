import React from "react";

// Sugerencias para el nombre del atributo (datalist): se puede escribir
// cualquier otro. Cubren varios giros de tienda, no solo café.
const SUGGESTED_NAMES = [
  "Notas de cata",
  "Tueste",
  "Intensidad",
  "Origen",
  "Proceso",
  "Altura",
  "Presentación",
  "Contenido",
  "Material",
  "Color",
  "Talla",
  "Dimensiones",
  "Peso",
  "Garantía",
];

const DATALIST_ID = "product-attribute-names";
const MAX_ATTRIBUTES = 30;

// Editor de pares libres "Nombre: valor", en el orden en que se mostrarán en
// la tienda. Las filas vacías se descartan al guardar (el backend también las
// ignora); una fila a medias la rechaza el backend. Por default es el de
// atributos del producto; las características de un plan de precios
// (StoreConfigListEditor, tipo "keyValueList") lo reusan con otros textos y
// límites.
const ProductAttributesEditor = ({
  value = [],
  onChange,
  legend = "Atributos (opcional)",
  hint = "Especificaciones que se muestran en la tienda, en este orden. Ej.: Notas de cata → Cacao, panela · Material → Barro · Talla → M.",
  suggestions = SUGGESTED_NAMES,
  datalistId = DATALIST_ID,
  max = MAX_ATTRIBUTES,
  valueMaxLength = 300,
  itemNoun = "atributo",
  namePlaceholder = "Nombre (ej. Tueste)",
  valuePlaceholder = "Valor (ej. Medio)",
}) => {
  const rows = value;

  const update = (index, field, fieldValue) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: fieldValue } : row)));
  };

  const add = () => {
    if (rows.length >= max) return;
    onChange([...rows, { name: "", value: "" }]);
  };

  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const iconButtonStyle = { width: "auto", padding: "0.35rem 0.6rem", margin: 0 };

  return (
    <fieldset style={{ border: "1px solid var(--input-border-color)", borderRadius: 8, padding: "0.75rem 1rem", margin: "0.75rem 0", minWidth: 0 }}>
      <legend style={{ padding: "0 0.35rem" }}>{legend}</legend>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", opacity: 0.8 }}>{hint}</p>

      <datalist id={datalistId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {rows.map((row, index) => (
        <div
          key={index}
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr) auto", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}
        >
          <input
            type="text"
            aria-label={`Nombre de ${itemNoun} ${index + 1}`}
            placeholder={namePlaceholder}
            list={datalistId}
            maxLength={60}
            value={row.name}
            onChange={(e) => update(index, "name", e.target.value)}
            style={{ marginBottom: 0 }}
          />
          <input
            type="text"
            aria-label={`Valor de ${itemNoun} ${index + 1}`}
            placeholder={valuePlaceholder}
            maxLength={valueMaxLength}
            value={row.value}
            onChange={(e) => update(index, "value", e.target.value)}
            style={{ marginBottom: 0 }}
          />
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button type="button" className="btn-secondary" style={iconButtonStyle} onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir">
              <i className="fas fa-arrow-up" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={iconButtonStyle}
              onClick={() => move(index, 1)}
              disabled={index === rows.length - 1}
              aria-label="Bajar"
            >
              <i className="fas fa-arrow-down" aria-hidden="true" />
            </button>
            <button type="button" className="btn-secondary" style={iconButtonStyle} onClick={() => remove(index)} aria-label="Eliminar">
              <i className="fas fa-trash" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={add} disabled={rows.length >= max}>
        <i className="fas fa-plus" aria-hidden="true" /> Agregar {itemNoun}
      </button>
    </fieldset>
  );
};

export default ProductAttributesEditor;
