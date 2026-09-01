import axios from "axios";

// backend/middleware/authMiddleware.js#verifyToken devuelve 401 con uno de
// estos códigos cuando el JWT del panel ya no sirve: falta el header
// (TOKEN_REQUIRED), el rol del token dejó de ser válido (TOKEN_INVALID_ROLE),
// o expiró/está corrupto (TOKEN_INVALID_OR_EXPIRED). A propósito NO incluye
// "INVALID_CREDENTIALS" (login fallido en /api/users/login): ese debe seguir
// mostrándose en el formulario de login, no disparar esta redirección.
const TOKEN_ERROR_PREFIX = "TOKEN_";

let redirecting = false;

// Se registra una sola vez (ver src/index.jsx) sobre la instancia por defecto
// de axios — todos los componentes hacen `import axios from "axios"`, que es
// el mismo singleton, así que esto cubre cualquier llamada sin tener que
// tocar cada componente.
export const setupAxiosSessionInterceptor = () => {
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status;
      const code = error.response?.data?.error?.code || "";

      if (status === 401 && code.startsWith(TOKEN_ERROR_PREFIX) && !redirecting) {
        redirecting = true;
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        // Reload completo (no navigate de React Router): App.jsx calcula
        // isLoggedIn a partir de localStorage una sola vez por render, así
        // que solo un reload fuerza a recalcularlo y a que las rutas
        // protegidas vuelvan a evaluarse como "no logueado" (mismo patrón
        // que ya usa Login.jsx tras un login exitoso).
        window.location.reload();
      }

      return Promise.reject(error);
    }
  );
};
