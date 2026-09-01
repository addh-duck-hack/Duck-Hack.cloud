// Se quita cualquier slash final para evitar URLs con doble slash al concatenar
// con un path que empieza en "/" (ej. REACT_APP_HOST_SERVICES_URL="https://api.x.com/"
// + "/api/mail/send-email" -> "...//api/mail/send-email"), que algunos proxies
// no resuelven igual que la ruta real y termina viéndose como un bloqueo de CORS.
export const getApiBaseUrl = () => (process.env.REACT_APP_HOST_SERVICES_URL || "").replace(/\/+$/, "");
const API_BASE_URL = getApiBaseUrl();

export const apiFetch = async (path, options = {}) => {
  if (!API_BASE_URL) {
    throw new Error("REACT_APP_HOST_SERVICES_URL no está configurado.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, options);

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Error de solicitud";
    throw new Error(message);
  }

  return payload;
};
