# Duck-Hack Cloud (Base CRM/eCommerce)

Base técnica del proyecto orientado a CRM/eCommerce single-tenant por instancia.

Estado actual:
- `backend`: API en Node.js + Express + MongoDB + JWT.
- `frontend-admin`: panel administrativo (React).
- `frontend-user`: frontend público (React).

## Requisitos

- Node.js 18.x recomendado.
- npm 9+.
- MongoDB (local o remoto).
- Cuenta SMTP para envío de correos (registro/verificación y contacto).
- Docker Desktop (opcional, para correr con `docker compose`).

## Estructura del proyecto

```text
backend/
frontend-admin/
frontend-user/
docker-compose.yml
```

## Variables de entorno

Ya existen archivos ejemplo:
- `backend/.env.example`
- `frontend-admin/.env.example`
- `frontend-user/.env.example`

Crear los archivos reales:

```bash
cp backend/.env.example backend/.env
cp frontend-admin/.env.example frontend-admin/.env
cp frontend-user/.env.example frontend-user/.env
```

### Backend (`backend/.env`)

```env
PORT=5000
MONGO_URL=mongodb://localhost:27017/duckhackdb
JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_ISSUER=duckhack-cloud-backend
JWT_AUDIENCE=duckhack-cloud-clients
JWT_ACCESS_EXPIRES_IN=1h
JWT_EMAIL_VERIFY_EXPIRES_IN=24h
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=user@example.com
EMAIL_PASS=xxxxx
FRONTEND_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:82,http://localhost:89
UPLOADS_DIR=/app/uploads
```

> **En Docker, `UPLOADS_DIR` debe ser `/app/uploads`** — es la ruta que `docker-compose.yml` monta como volumen nombrado (`<STORE_SLUG>.backend-uploads`, ver `.env`), para que las imágenes subidas (logos, fotos de equipo/clientes, productos) sobrevivan a `docker compose up -d --build`. Sin ese volumen (o con `UPLOADS_DIR` apuntando a otra ruta, como el viejo default `/tmp/media-uploads`), las subidas viven solo en la capa escribible del contenedor y se pierden por completo cada vez que se recrea con una imagen nueva.

### Frontend Admin (`frontend-admin/.env`)

```env
REACT_APP_HOST_SERVICES_URL=http://localhost:5000
```

### Frontend User (`frontend-user/.env`)

```env
REACT_APP_HOST_SERVICES_URL=http://localhost:5000
```

## Arranque local (sin Docker)

Instalar dependencias:

```bash
cd backend && npm install
cd ../frontend-admin && npm install
cd ../frontend-user && npm install
```

### 1) Backend

```bash
cd backend
npm start
```

Disponible en: `http://localhost:5000`

### 2) Frontend User

```bash
cd frontend-user
npm start
```

Disponible en: `http://localhost:3000`

### 3) Frontend Admin

Para evitar conflicto con el puerto 3000:

```bash
cd frontend-admin
PORT=3001 npm start
```

Disponible en: `http://localhost:3001`

## Arranque con Docker Compose

```bash
docker compose up --build
```

Puertos expuestos:
- Frontend admin: `http://localhost:89`
- Frontend user: `http://localhost:82`
- Backend API: `http://localhost:83`

Importante:
- El `docker-compose.yml` actual **no** incluye contenedor de MongoDB.
- Si usas Mongo local en macOS desde contenedor, usa `host.docker.internal` en `MONGO_URL`.
  - Ejemplo: `MONGO_URL=mongodb://host.docker.internal:27017/duckhackdb`

## API disponible (actual)

Base URL local: `http://localhost:5000`

Rutas activas:
- `POST /api/users/register`
- `GET /api/users/verify?token=...`
- `POST /api/users/login`
- `GET /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`
- `PATCH /api/users/:id/password`
- `DELETE /api/users/:id`
- `POST /api/mail/send-email`
- `GET /uploads/...`

## Modelo de despliegue

- Este proyecto se trabajará como **single-tenant por instancia**.
- El código se reutiliza, pero cada cliente tendrá su propio:
  - `backend`
  - `frontend-admin`
  - `frontend-user`
  - base de datos MongoDB
- No hay aislamiento por `tenantId` dentro del código; el aislamiento es por infraestructura y despliegue independiente.

## Roles del sistema

- `super_admin`
- `store_admin`
- `catalog_manager`
- `order_manager`
- `customer`

## Formato estándar de errores

La API devuelve errores en formato uniforme:

```json
{
  "ok": false,
  "error": {
    "status": 400,
    "code": "VALIDATION_ERROR",
    "message": "Descripcion del error"
  }
}
```

## Documentación complementaria

- API OpenAPI: `backend/openapi.yaml`
- Contratos para Notion: `docs/notion-interface-contracts.md`
- Handbook técnico de API (BL-015): `docs/bl-015-api-handbook.md`
- Plantilla Notion para cambios de API: `docs/notion-bl015-api-change-template.md`
- Smoke tests de flujo (BL-014): `docs/bl-014-test-flow.md`

## Reutilización de módulos entre tiendas

La infraestructura de tenant compartido (Modelo B: `backend/utils/dbConnectionManager.js`,
`backend/scripts/tenant-bootstrap.mongo.js`, variables `TENANT_*`) que documentaban antes
las secciones INF-001/INF-002/BE-001 fue removida — ver
[`docs/adr-monorepo-shared-packages.md`](docs/adr-monorepo-shared-packages.md). Cada tienda
sigue con su propio backend/DB/despliegue; la reutilización de código entre tiendas se
resuelve ahora con los paquetes de workspace en `packages/core-api` y `packages/ui-kit`
(ver sus respectivos `README.md`).

## Publicar tiendas: flujo de ramas (`main` → `release-<dominio>`)

`main` es la rama canónica: ahí vive todo el desarrollo compartido (módulos nuevos en
`packages/core-api`/`packages/ui-kit`, fixes, features de backend/admin) y es la base
desde la que sale **toda** tienda nueva. Cada tienda desplegada corre desde su propia
rama `release-<dominio-público-de-la-tienda>` (ej. `release-mx.duck-hack.cloud`) — el
nombre debe coincidir con el dominio real del `frontend-user` de esa tienda, para que sea
inequívoco qué rama corresponde a qué despliegue.

**Regla de una sola dirección**: los merges van siempre `main → release-<dominio>`,
nunca al revés.
- Cualquier funcionalidad nueva compartida (un módulo, un fix, lo que sea que otras
  tiendas también deban recibir) se desarrolla y se mergea primero en `main` — nunca
  directo en una rama `release-*`.
- Un cambio específico de una tienda (algo que **no** debe replicarse a las demás) se
  commitea directo en su rama `release-<dominio>` y **nunca** se mergea de vuelta a
  `main`.
- Nunca se mergea una rama `release-*` a otra `release-*` — si dos tiendas necesitan el
  mismo cambio, ese cambio pasa primero por `main`.

### Publicar una tienda nueva

```bash
git checkout main
git pull
git checkout -b release-<dominio-de-la-tienda>
git push -u origin release-<dominio-de-la-tienda>
```

A partir de ahí, sigue el proceso normal de una instancia nueva (ver "Modelo de
despliegue" arriba): checkout de esa rama en el servidor de la tienda, `.env` de las 3
apps configurados en ese servidor (no viven en git — ver `.gitignore`), `docker compose
up --build`, Proxy Hosts en Nginx Proxy Manager, bootstrap de `StoreConfig` y del primer
usuario admin.

**`.env` en la raíz (obligatorio):** además de los `.env` de las 3 apps, copia
`.env.example` de la raíz a `.env` y ponle un `STORE_SLUG` **único por tienda**. De
ahí salen el nombre del proyecto Compose, los `container_name`, las redes internas y
el volumen de uploads — sin esto, dos clones del repo en el mismo servidor chocan
(`container name … already in use`, `network/volume … created for project …`). El
`STORE_SLUG` también es el hostname al que apuntan los Proxy Hosts de NPM
(`<slug>.frontend-admin:8080`, `<slug>.frontend-user:8080`, `<slug>.backend:5000`).

> La tienda que ya estaba desplegada antes de este cambio debe usar
> `STORE_SLUG=duck-hack` para conservar su volumen `duck-hack.backend-uploads` (y las
> imágenes ya subidas) sin migrar nada.

### Llevar una actualización de `main` a una tienda ya publicada

Propagar un cambio de `main` a una tienda es una decisión explícita por tienda, no
automática — así una tienda no se rompe porque otra recibió un cambio sin probar del
todo:

```bash
git checkout release-<dominio-de-la-tienda>
git pull
git merge main   # resolver conflictos si esa tienda tiene parches propios encima de main
git push
```

Y redesplegar esa tienda (`docker compose up --build` en su servidor).

## DOC-002 — Guía de uso: Tabla de errores conocidos

Ubicación en Notion:
- `Documentación técnica -> Tabla de errores conocidos`

Objetivo:
- Registrar errores reales y recurrentes para acelerar diagnóstico, soporte y prevención.

Cuándo registrar un error:
- Se repite en más de 1 ocasión.
- Bloquea desarrollo/despliegue o afecta flujo de negocio.
- Genera incertidumbre operativa (causa no documentada).

Campos mínimos recomendados por registro:
- `code`: identificador único (ej. `TENANT_NOT_FOUND`, `RATE_LIMIT_LOGIN_EXCEEDED`).
- `HTTP`: estatus asociado (400/401/403/404/409/500, etc.).
- `descripcion_breve`: síntoma + causa principal + acción rápida.

Convenciones:
- `code` en MAYÚSCULAS con `_`.
- 1 error por registro (no mezclar varios casos en una fila).
- Si cambia la solución, actualizar el mismo registro (evitar duplicados).

Plantilla sugerida para `descripcion_breve`:
- `Síntoma: ... | Causa raíz: ... | Solución: ... | Prevención: ...`

Flujo operativo:
1. Detectar error en logs/UI/API.
2. Confirmar si ya existe en la tabla por `code`.
3. Si no existe: crear registro con campos mínimos.
4. Si existe: mejorar causa/solución/preventivo.
5. Referenciar `code` en commits/PR cuando aplique.

Buenas prácticas:
- Priorizar primero errores de seguridad, aislamiento tenant y autenticación.
- Mantener textos cortos y accionables.
- Revisar semanalmente la tabla para cerrar huecos de prevención.

## Troubleshooting rápido

- Error de conexión MongoDB:
  - Revisar `MONGO_URL` y conectividad.
- Error al iniciar backend por JWT:
  - Revisar `JWT_SECRET` (mínimo 32 chars), `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ACCESS_EXPIRES_IN`, `JWT_EMAIL_VERIFY_EXPIRES_IN`.
- Error SMTP al registrar/contacto:
  - Revisar `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`.
- Error de permisos al subir imágenes (`EACCES`):
  - Configurar `UPLOADS_DIR` a una ruta escribible (`/app/uploads` en Docker, cualquier ruta local fuera de Docker).
- Las imágenes subidas (logo, fotos de clientes/equipo) desaparecen después de `docker compose up -d --build`:
  - `UPLOADS_DIR` no está apuntando al volumen persistente. Confirmar que `backend/.env` tiene `UPLOADS_DIR=/app/uploads` (coincide con el volumen `duck-hack.backend-uploads` de `docker-compose.yml`) y no algo como `/tmp/media-uploads`, que vive en la capa descartable del contenedor.
- Frontend no llega al backend:
  - Revisar `REACT_APP_HOST_SERVICES_URL` en ambos frontends.
- Error CORS (origen no permitido):
  - Revisar `CORS_ALLOWED_ORIGINS` en `backend/.env`.
- Login rechaza cuenta no verificada:
  - Completar flujo de verificación por correo (`/api/users/verify`).
