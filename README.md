# Duck-Hack Cloud (Base CRM/eCommerce)

Base técnica del proyecto orientado a CRM/eCommerce multi-tenant.

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
JWT_SECRET=xxxxx
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=user@example.com
EMAIL_PASS=xxxxx
FRONTEND_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:82,http://localhost:89
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

## Troubleshooting rápido

- Error de conexión MongoDB:
  - Revisar `MONGO_URL` y conectividad.
- Error SMTP al registrar/contacto:
  - Revisar `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`.
- Frontend no llega al backend:
  - Revisar `REACT_APP_HOST_SERVICES_URL` en ambos frontends.
- Error CORS (origen no permitido):
  - Revisar `CORS_ALLOWED_ORIGINS` en `backend/.env`.
- Login rechaza cuenta no verificada:
  - Completar flujo de verificación por correo (`/api/users/verify`).
