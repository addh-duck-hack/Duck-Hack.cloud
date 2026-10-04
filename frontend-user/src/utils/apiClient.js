// Se quita cualquier slash final para evitar URLs con doble slash al concatenar
// con un path que empieza en "/" (ej. REACT_APP_HOST_SERVICES_URL="https://api.x.com/"
// + "/api/mail/send-email" -> "...//api/mail/send-email"), que algunos proxies
// no resuelven igual que la ruta real y termina viéndose como un bloqueo de CORS.
export const getApiBaseUrl = () => (process.env.REACT_APP_HOST_SERVICES_URL || "").replace(/\/+$/, "");
const API_BASE_URL = getApiBaseUrl();

// Sesión vencida o inválida: el backend responde 401 con estos códigos
// (packages/core-api/lib/authMiddleware.js#verifyToken). Si la petición iba
// con la sesión (Authorization), se avisa con el evento `auth:expired` y
// AuthProvider (hooks/useAuth.jsx) cierra la sesión. Los tokens de pedido o
// de cita (X-Order-Token / X-Appointment-Token) y el login no cuentan.
export const SESSION_EXPIRED_EVENT = 'auth:expired';
const SESSION_ERROR_CODES = ['TOKEN_INVALID_OR_EXPIRED', 'TOKEN_INVALID_ROLE'];

const sentSession = (headers) =>
  Boolean(headers) && Object.keys(headers).some((name) => name.toLowerCase() === 'authorization' && headers[name]);

export const reportSessionError = (status, code, headers) => {
  if (status === 401 && SESSION_ERROR_CODES.includes(code) && sentSession(headers) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
};

export const apiFetch = async (path, options = {}) => {
  if (!API_BASE_URL) {
    throw new Error("REACT_APP_HOST_SERVICES_URL no está configurado.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, options);

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  // El error lleva además el status HTTP y el `code` del backend
  // ({ ok:false, error:{ status, code, message } }) por si la UI necesita
  // distinguir casos (p. ej. ACCOUNT_NOT_VERIFIED o un endpoint que no existe).
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Error de solicitud";
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    reportSessionError(error.status, error.code, options.headers);
    throw error;
  }

  return payload;
};
