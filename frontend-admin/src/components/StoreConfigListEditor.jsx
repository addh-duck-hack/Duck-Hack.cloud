import React, { useState } from "react";
import MediaField from "./MediaField";
import { FA_ICON_DATALIST_ID, FA_ICON_SUGGESTIONS } from "../utils/faIconSuggestions";

// Chips add/remove para un campo de tipo "stringList" (ej. extraFeatures de
// un plan de precios). Mismo patrón visual que dockerContainers en
// AgencyClientForm.jsx (input + botón "Agregar" + badges con × para quitar).
export const StringChipsEditor = ({ values, onChange }) => {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setDraft("");
  };

  const remove = (value) => {
    onChange(values.filter((v) => v !== value));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Agregar..."
        />
        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={add}>
          Agregar
        </button>
      </div>
      {values.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
          {values.map((value) => (
            <span key={value} className="badge badge-green" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              {value}
              <button
                type="button"
                onClick={() => remove(value)}
                aria-label={`Quitar ${value}`}
                style={{ width: "auto", padding: 0, background: "none", border: "none", color: "inherit", cursor: "pointer" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const renderField = (field, item, onItemChange) => {
  const value = item[field.name];

  if (field.type === "boolean") {
    return (
      <label key={field.name} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          checked={value !== false}
          onChange={(e) => onItemChange(field.name, e.target.checked)}
          style={{ width: "auto", margin: 0 }}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label key={field.name} style={{ gridColumn: field.fullWidth ? "1 / span 2" : undefined }}>
        {field.label}
        <textarea
          value={value || ""}
          maxLength={field.maxLength}
          onChange={(e) => onItemChange(field.name, e.target.value)}
          rows={field.rows || 3}
        />
      </label>
    );
  }

  if (field.type === "stringList") {
    return (
      <div key={field.name} style={{ gridColumn: "1 / span 2" }}>
        <label style={{ display: "block", marginBottom: "0.35rem" }}>{field.label}</label>
        <StringChipsEditor values={value || []} onChange={(next) => onItemChange(field.name, next)} />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label key={field.name} style={{ gridColumn: field.fullWidth ? "1 / span 2" : undefined }}>
        {field.label}
        <select value={value ?? field.options?.[0]?.value ?? ""} onChange={(e) => onItemChange(field.name, e.target.value)}>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "icon") {
    return (
      <label key={field.name} style={{ gridColumn: field.fullWidth ? "1 / span 2" : undefined }}>
        {field.label}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {/* Vista previa en vivo — sin esto, la única forma de saber si la
              clase escrita existe/se ve bien era guardar y revisar el sitio
              público. */}
          <span
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              border: "1px solid var(--input-border-color)",
              background: "var(--input-background-color)",
              fontSize: "1.1rem",
            }}
          >
            <i className={value || "fas fa-question"} aria-hidden="true" />
          </span>
          <input
            type="text"
            value={value ?? ""}
            maxLength={field.maxLength}
            placeholder={field.placeholder || "fas fa-server"}
            list={FA_ICON_DATALIST_ID}
            style={{ marginBottom: 0 }}
            onChange={(e) => onItemChange(field.name, e.target.value)}
          />
        </div>
      </label>
    );
  }

  if (field.type === "image") {
    return (
      <div key={field.name} style={{ gridColumn: field.fullWidth ? "1 / span 2" : undefined }}>
        <MediaField
          label={field.label}
          value={value}
          onChange={(mediaPath) => onItemChange(field.name, mediaPath)}
          kinds={field.mediaKinds}
        />
      </div>
    );
  }

  // URL que también se puede elegir de la biblioteca de medios (ej. video
  // directo del hero): se guarda la URL absoluta porque el backend la valida
  // como URL, pero sigue editable a mano para enlaces externos.
  if (field.type === "url" && field.mediaKinds) {
    return (
      <div key={field.name} style={{ gridColumn: field.fullWidth ? "1 / span 2" : undefined }}>
        <label>
          {field.label}
          <input
            type="url"
            value={value ?? ""}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            onChange={(e) => onItemChange(field.name, e.target.value)}
          />
        </label>
        <div style={{ marginTop: "-0.75rem", marginBottom: "1rem" }}>
          <MediaField
            value={value}
            onChange={(url) => onItemChange(field.name, url)}
            kinds={field.mediaKinds}
            valueFormat="url"
            pickerTitle={`Elegir: ${field.label}`}
          />
        </div>
      </div>
    );
  }

  // text | number | tel | email | url (default). `digitsOnly`: descarta todo
  // lo que no sea dígito mientras se escribe/pega y corta a `maxLength`.
  const toValue = (raw) => {
    if (field.type === "number") return raw === "" ? null : Number(raw);
    if (field.digitsOnly) return raw.replace(/\D/g, "").slice(0, field.maxLength || undefined);
    return raw;
  };

  return (
    <label key={field.name} style={{ gridColumn: field.fullWidth ? "1 / span 2" : undefined }}>
      {field.label}
      <input
        type={field.type || "text"}
        value={value ?? ""}
        maxLength={field.maxLength}
        required={field.required}
        placeholder={field.placeholder}
        inputMode={field.digitsOnly ? "numeric" : undefined}
        pattern={field.digitsOnly ? "[0-9]*" : undefined}
        onChange={(e) => onItemChange(field.name, toValue(e.target.value))}
      />
    </label>
  );
};

// Editor genérico de lista de objetos (add / editar / reordenar / eliminar),
// reutilizado por heroSlides, metrics, services, pricingPlans, faqs,
// teamMembers y testimonials — solo cambia el `fields` que se le pasa.
// No hace fetch ni PUT: es "tonto", el padre es dueño del array completo y
// decide cuándo guardarlo (mismo patrón que StoreConfigManager con `theme`).
const StoreConfigListEditor = ({ items, onChange, itemLabel, fields, createEmptyItem, addButtonLabel = "+ Agregar" }) => {
  const [expandedIndex, setExpandedIndex] = useState(null);

  // El orden visible ES el sortOrder — se reescribe en cada cambio para no
  // exponerlo como un campo numérico manual que el admin tenga que mantener.
  const withSortOrder = (list) => list.map((item, index) => ({ ...item, sortOrder: index }));

  const updateItem = (index, patch) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(withSortOrder(next));
  };

  const move = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(withSortOrder(next));
    setExpandedIndex(targetIndex);
  };

  const removeItem = (index) => {
    if (!window.confirm("¿Eliminar este elemento?")) return;
    const next = items.filter((_, i) => i !== index);
    onChange(withSortOrder(next));
    setExpandedIndex(null);
  };

  const addItem = () => {
    const next = [...items, createEmptyItem()];
    onChange(withSortOrder(next));
    setExpandedIndex(next.length - 1);
  };

  const hasIconField = fields.some((field) => field.type === "icon");

  return (
    <div>
      {/* Un solo <datalist> compartido por todos los inputs de tipo "icon" de
          esta lista (el atributo `list` de cada input lo referencia por id) —
          sugerencias, no restringe a solo esas: el campo sigue siendo texto libre. */}
      {hasIconField ? (
        <datalist id={FA_ICON_DATALIST_ID}>
          {FA_ICON_SUGGESTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </datalist>
      ) : null}
      {items.map((item, index) => {
        const isExpanded = expandedIndex === index;
        return (
          <div key={index} className="client-card" style={{ marginBottom: "0.75rem", cursor: "default" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                style={{ width: "auto", flex: 1, textAlign: "left", background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
              >
                {isExpanded ? "▾" : "▸"} {itemLabel(item) || `Elemento ${index + 1}`}
              </button>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => move(index, -1)} disabled={index === 0}>
                  ▲
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "auto" }}
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                >
                  ▼
                </button>
                <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => removeItem(index)}>
                  Eliminar
                </button>
              </div>
            </div>

            {isExpanded ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
                {fields.map((field) => renderField(field, item, (name, value) => updateItem(index, { [name]: value })))}
              </div>
            ) : null}
          </div>
        );
      })}

      <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={addItem}>
        {addButtonLabel}
      </button>
    </div>
  );
};

export default StoreConfigListEditor;
