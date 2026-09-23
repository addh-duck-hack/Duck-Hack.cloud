import React, { useState } from "react";
import { mediaSrc } from "../utils/mediaApi";
import MediaPicker from "./MediaPicker";

// Galería de varias imágenes por producto (Product.images[]) — la primera es
// la "principal" (la que usan ProductList.jsx y el storefront como
// miniatura/portada). A diferencia de MediaField (un solo valor), este
// componente maneja el arreglo completo: agregar (desde MediaPicker, varias a
// la vez, de la biblioteca o subiendo nuevas), quitar y reordenar.
const ProductImageGallery = ({ label = "Imágenes del producto", value, onChange }) => {
  const images = value || [];
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleAdd = (items) => {
    const newPaths = items.map((item) => item.path).filter((path) => !images.includes(path));
    if (newPaths.length) onChange([...images, ...newPaths]);
    setIsPickerOpen(false);
  };

  const handleRemove = (index) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const handleMove = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <label style={{ display: "block", marginBottom: "0.35rem" }}>{label}</label>

      {images.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
          {images.map((path, index) => (
            <div
              key={path}
              style={{
                width: 96,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.3rem",
                border: "1px solid var(--input-border-color)",
                borderRadius: 6,
                padding: "0.4rem",
              }}
            >
              <img
                src={mediaSrc(path)}
                alt={`Imagen ${index + 1}`}
                style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4 }}
              />
              <span style={{ fontSize: "0.72rem", color: index === 0 ? "var(--primary-color)" : "var(--placeholder-color)" }}>
                {index === 0 ? "Principal" : `#${index + 1}`}
              </span>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "auto", padding: "0.15rem 0.45rem" }}
                  disabled={index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label="Mover antes"
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "auto", padding: "0.15rem 0.45rem" }}
                  disabled={index === images.length - 1}
                  onClick={() => handleMove(index, 1)}
                  aria-label="Mover después"
                >
                  ▶
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "auto", fontSize: "0.78rem" }}
                onClick={() => handleRemove(index)}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: "0 0 0.5rem", color: "var(--placeholder-color)" }}>Este producto todavía no tiene imágenes.</p>
      )}

      <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => setIsPickerOpen(true)}>
        <i className="fas fa-photo-video" aria-hidden="true" /> Agregar imágenes
      </button>

      {isPickerOpen ? (
        <MediaPicker
          kinds={["image", "gif"]}
          multiple
          title="Agregar imágenes al producto"
          disabledPaths={images}
          onSelect={handleAdd}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}
    </div>
  );
};

export default ProductImageGallery;
