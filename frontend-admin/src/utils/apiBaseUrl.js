// Normaliza REACT_APP_HOST_SERVICES_URL para evitar dobles slashes al concatenar
// rutas (ej. "https://api.duck-hack.cloud/" + "/api/users/login" -> "//api/users/login"),
// que en algunos entornos de proxy no coincide con la ruta real del backend y termina
// pareciendo un bloqueo de CORS en el navegador.
export const getApiBaseUrl = () => (process.env.REACT_APP_HOST_SERVICES_URL || "").replace(/\/+$/, "");
