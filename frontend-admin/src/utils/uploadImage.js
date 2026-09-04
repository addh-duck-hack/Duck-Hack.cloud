import axios from "axios";
import { getApiBaseUrl } from "./apiBaseUrl";

// Sube un archivo de imagen a cualquiera de los endpoints de subida del
// sistema (POST /api/store-config/upload-image, POST /api/uploads/products-image...)
// y devuelve el `imagePath` relativo (ej. "uploads/productImage-....jpg").
// Extraído de ImageUploadField.jsx para que ProductImageGallery.jsx (galería
// de varias imágenes por producto) lo reuse sin duplicar el POST.
export const uploadImage = async (file, { uploadUrl, fieldName, baseUrl } = {}) => {
  const formData = new FormData();
  formData.append(fieldName || "image", file);
  const response = await axios.post(`${baseUrl || getApiBaseUrl()}${uploadUrl}`, formData, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data?.imagePath || "";
};
