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
UPLOADS_DIR=/tmp/media-uploads
```

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
  - Configurar `UPLOADS_DIR` a una ruta escribible (por ejemplo `/tmp/media-uploads`).
- Frontend no llega al backend:
  - Revisar `REACT_APP_HOST_SERVICES_URL` en ambos frontends.
- Error CORS (origen no permitido):
  - Revisar `CORS_ALLOWED_ORIGINS` en `backend/.env`.
- Login rechaza cuenta no verificada:
  - Completar flujo de verificación por correo (`/api/users/verify`).
