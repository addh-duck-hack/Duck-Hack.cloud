import React, { useEffect, useState } from "react";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { uploadImage } from "../utils/uploadImage";

// Campo reutilizable de subida de imagen. Por default sube a
// POST /api/store-config/upload-image (logo, foto de equipo, foto de
// testimonio) — pasando `uploadUrl`/`fieldName` se reutiliza para otros
// endpoints de imagen del sistema. No conoce a qué campo del formulario
// padre pertenece: solo sube el archivo y devuelve el `imagePath` relativo
// (ej. "uploads/productImage-....jpg") vía onChange. Para varias imágenes
// por producto ver ProductImageGallery.jsx, que reusa uploadImage() pero
// maneja su propio arreglo en vez de este componente de valor único.
const ImageUploadField = ({
  label,
  value,
  onChange,
  previewBaseUrl,
  uploadUrl = "/api/store-config/upload-image",
  fieldName = "image",
}) => {
  const [file, setFile] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = previewBaseUrl || getApiBaseUrl();

  useEffect(() => {
    if (!file) {
      setLocalPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setError("");
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError("");
    try {
      const imagePath = await uploadImage(file, { uploadUrl, fieldName, baseUrl });
      onChange(imagePath);
      setFile(null);
    } catch (err) {
      const msg = err.response?.data?.error?.message || "No fue posible subir la imagen.";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Deja el campo sin imagen — antes no había forma de "vaciar" un valor ya
  // subido (el logo, una foto de equipo/testimonio) una vez elegido.
  const handleRemove = () => {
    setFile(null);
    setError("");
    onChange("");
  };

  const previewSrc = localPreviewUrl || (value ? `${baseUrl}/${value}` : "");

  return (
    <div>
      {label ? <label style={{ display: "block", marginBottom: "0.35rem" }}>{label}</label> : null}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={label || "Vista previa"}
            style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid var(--input-border-color)" }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 64,
              height: 64,
              borderRadius: 6,
              border: "1px dashed var(--input-border-color)",
            }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <input type="file" accept="image/png,image/jpeg" onChange={handleFileChange} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "auto" }}
              disabled={!file || isUploading}
              onClick={handleUpload}
            >
              {isUploading ? "Subiendo..." : "Subir imagen"}
            </button>
            {value ? (
              <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={handleRemove}>
                Quitar
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {error ? <div className="auth-error">{error}</div> : null}
    </div>
  );
};

export default ImageUploadField;
