import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

// Campo reutilizable de subida de imagen. Por default sube a
// POST /api/store-config/upload-image (logo, foto de equipo, foto de
// testimonio) — pasando `uploadUrl`/`fieldName` se reutiliza para otros
// endpoints de imagen del sistema (ej. POST /api/uploads/products-image,
// campo "productImage", usado por ProductForm.jsx). No conoce a qué campo
// del formulario padre pertenece: solo sube el archivo y devuelve el
// `imagePath` relativo (ej. "uploads/productImage-....jpg") vía onChange.
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

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

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
      const formData = new FormData();
      formData.append(fieldName, file);
      const response = await axios.post(`${baseUrl}${uploadUrl}`, formData, {
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "multipart/form-data",
        },
      });
      onChange(response.data?.imagePath || "");
      setFile(null);
    } catch (err) {
      const msg = err.response?.data?.error?.message || "No fue posible subir la imagen.";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
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
          <button
            type="button"
            className="btn-secondary"
            style={{ width: "auto" }}
            disabled={!file || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? "Subiendo..." : "Subir imagen"}
          </button>
        </div>
      </div>
      {error ? <div className="auth-error">{error}</div> : null}
    </div>
  );
};

export default ImageUploadField;
