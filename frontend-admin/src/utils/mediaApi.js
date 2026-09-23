import axios from "axios";
import { getApiBaseUrl } from "./apiBaseUrl";

// Cliente de /api/media (packages/core-api/modules/media.js), compartido por
// la biblioteca de medios (MediaLibrary.jsx) y el selector (MediaPicker.jsx)
// que usan todos los campos de imagen/video del panel.

export const MEDIA_KIND_LABELS = { image: "Imagen", gif: "GIF", video: "Video" };

const ACCEPT_BY_KIND = {
  image: "image/jpeg,image/png",
  gif: "image/gif",
  video: "video/mp4,video/webm",
};

export const acceptForKinds = (kinds) => kinds.map((kind) => ACCEPT_BY_KIND[kind]).filter(Boolean).join(",");

export const getMediaAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

export const getMediaErrorMessage = (err, fallback) => err.response?.data?.error?.message || fallback;

// Las rutas guardadas son relativas ("uploads/x.jpg"); una URL absoluta
// (ej. la de un video del hero) se usa tal cual.
export const mediaSrc = (mediaPath) =>
  /^https?:\/\//i.test(mediaPath || "") ? mediaPath : `${getApiBaseUrl()}/${mediaPath}`;

export const fetchMediaItems = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/api/media`, { headers: getMediaAuthHeaders() });
  return response.data?.items || [];
};

export const uploadMediaFile = async (file) => {
  const formData = new FormData();
  formData.append("media", file);
  const response = await axios.post(`${getApiBaseUrl()}/api/media`, formData, {
    headers: { ...getMediaAuthHeaders(), "Content-Type": "multipart/form-data" },
  });
  return response.data.item;
};
