# frontend-user

Storefront público de Duck-Hack (React + Vite). Migrado de Create React App a
[Vite](https://vite.dev/) porque `react-scripts` ya no recibe mantenimiento ni
parches de seguridad.

## Scripts

En el directorio del proyecto:

### `npm start` / `npm run dev`

Levanta el servidor de desarrollo de Vite en http://localhost:3000 (HMR).

### `npm test`

Ejecuta la suite con [Vitest](https://vitest.dev/) una sola vez.
Usa `npm run test:watch` para modo interactivo.

### `npm run build`

Compila la app de producción a la carpeta `build/` (assets con hash).

### `npm run preview`

Sirve localmente el contenido de `build/` para verificar el bundle de producción.

## Variables de entorno

Se mantiene el prefijo `REACT_APP_` (ver `.env.example`). Vite las inyecta en
tiempo de compilación; `vite.config.js` reemplaza `process.env.REACT_APP_*` por
su valor. Variables consumidas:

- `REACT_APP_HOST_SERVICES_URL` — base del backend.
- `REACT_APP_STORE_SLUG` — slug de tienda para el header `X-Tenant-Slug`.
- `REACT_APP_TENANT_HEADER_NAME` — nombre de ese header (default `X-Tenant-Slug`).
- `REACT_APP_ADMIN_URL` — link "Administrador" del sidebar.

## Docker

Build multi-stage: Node 22 compila con Vite y la imagen final es
`nginxinc/nginx-unprivileged` (nginx corre como usuario sin privilegios,
escucha en **8080**). Ver `nginx.conf` para el fallback de SPA (`BrowserRouter`)
y cabeceras de seguridad.
