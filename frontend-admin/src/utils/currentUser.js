// Decodifica (sin verificar firma — no hace falta: es solo para la UI, el
// backend es quien realmente aplica las reglas, ver
// packages/core-api/modules/auth.js) el payload del JWT guardado en
// localStorage para saber el id de la cuenta con sesión iniciada. Se usa para
// deshabilitar en la UI acciones que el backend igual rechazaría (borrar tu
// propia cuenta, cambiar tu propio rol) en vez de dejar que el usuario las
// intente y reciba el error del servidor.
export const getCurrentUserId = () => {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded?.id || null;
  } catch {
    return null;
  }
};
