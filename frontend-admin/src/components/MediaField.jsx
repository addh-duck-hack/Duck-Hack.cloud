import React, { useState } from "react";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { mediaSrc } from "../utils/mediaApi";
import MediaPicker from "./MediaPicker";
import MediaPreview from "./MediaPreview";

const KIND_BY_EXTENSION = { jpg: "image", jpeg: "image", png: "image", gif: "gif", mp4: "video", webm: "video" };

const guessKind = (value) => {
  const extension = (value || "").split("?")[0].split(".").pop().toLowerCase();
  return KIND_BY_EXTENSION[extension] || "image";
};

// Campo de un solo medio (logo, foto de equipo/testimonio, imagen del hero...).
// No sube nada por sí mismo: abre MediaPicker para elegir de la biblioteca o
// subir uno nuevo (vía /api/media, así todo queda registrado en Medios).
// Devuelve por onChange la ruta relativa ("uploads/x.jpg") o, con
// valueFormat="url", la URL absoluta — para campos que el backend valida como
// URL (ej. heroSlides[].mediaUrl de un video directo).
const MediaField = ({ label, value, onChange, kinds = ["image"], valueFormat = "path", pickerTitle }) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleSelect = ([item]) => {
    onChange(valueFormat === "url" ? `${getApiBaseUrl()}/${item.path}` : item.path);
    setIsPickerOpen(false);
  };

  const previewItem = value ? { kind: guessKind(value), title: label || "", altText: "Vista previa no disponible" } : null;

  return (
    <div>
      {label ? <label style={{ display: "block", marginBottom: "0.35rem" }}>{label}</label> : null}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {previewItem ? (
          <div className="media-field-thumb">
            <MediaPreview item={previewItem} src={mediaSrc(value)} />
          </div>
        ) : (
          <div className="media-field-thumb is-empty" aria-hidden="true">
            <i className="fas fa-image" />
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => setIsPickerOpen(true)}>
            <i className="fas fa-photo-video" aria-hidden="true" /> {value ? "Cambiar" : "Elegir o subir"}
          </button>
          {value ? (
            <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => onChange("")}>
              Quitar
            </button>
          ) : null}
        </div>
      </div>

      {isPickerOpen ? (
        <MediaPicker
          kinds={kinds}
          title={pickerTitle || (label ? `Elegir: ${label}` : "Elegir medio")}
          onSelect={handleSelect}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}
    </div>
  );
};

export default MediaField;
