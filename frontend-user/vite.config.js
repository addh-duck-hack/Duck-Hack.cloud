import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Migrado de Create React App (react-scripts, ya sin mantenimiento) a Vite.
// Se conservan a propósito:
//   - el prefijo REACT_APP_ para las variables de entorno (mismos .env / .env.example)
//   - la carpeta de salida "build/" (los Dockerfiles copian /app/build)
// para que el despliegue y el proxy no cambien.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "REACT_APP_");

  // El código fuente sigue leyendo process.env.REACT_APP_*; Vite no expone
  // process.env en el cliente, así que se reemplaza estáticamente cada variable
  // que realmente usa el storefront. Las no definidas quedan como "" (igual que CRA).
  const clientEnv = {
    "process.env.REACT_APP_HOST_SERVICES_URL": JSON.stringify(env.REACT_APP_HOST_SERVICES_URL || ""),
    "process.env.REACT_APP_TENANT_HEADER_NAME": JSON.stringify(env.REACT_APP_TENANT_HEADER_NAME || ""),
    "process.env.REACT_APP_STORE_SLUG": JSON.stringify(env.REACT_APP_STORE_SLUG || ""),
    "process.env.REACT_APP_ADMIN_URL": JSON.stringify(env.REACT_APP_ADMIN_URL || ""),
  };

  return {
    plugins: [react()],
    envPrefix: "REACT_APP_",
    define: clientEnv,
    server: { port: 3000, host: true, open: false },
    preview: { port: 3000, host: true },
    build: { outDir: "build", sourcemap: false },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.js",
      css: true,
    },
  };
});
