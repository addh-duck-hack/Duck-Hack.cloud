# BL-015 - API Handbook (Backend)

## 1) Objetivo

Este documento complementa el archivo OpenAPI y define cómo usar, operar y evolucionar la API del proyecto CRM/eCommerce.

Fuentes principales:
- Especificación API: `/Users/jacobo/Documents/Desarrollo Duck-Hack/Duck-Hack.cloud/backend/openapi.yaml`
- Contratos de interfaz: `/Users/jacobo/Documents/Desarrollo Duck-Hack/Duck-Hack.cloud/docs/notion-interface-contracts.md`

## 2) Contexto de arquitectura

- Modelo de despliegue: single-tenant por instancia.
- Stack backend: Node.js + Express + MongoDB.
- Seguridad base activa:
  - JWT con restricciones (`HS256`, `iss`, `aud`, `tokenType`).
  - RBAC por roles.
  - Rate limit para register/login/contact.
  - CORS por whitelist desde `.env`.
  - Headers de seguridad con `helmet`.
  - Validación de imágenes reales (JPG/PNG) con `sharp`.

## 3) Variables de entorno críticas

Definir en `backend/.env`:

```env
JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_ISSUER=duckhack-cloud-backend
JWT_AUDIENCE=duckhack-cloud-clients
JWT_ACCESS_EXPIRES_IN=1h
JWT_EMAIL_VERIFY_EXPIRES_IN=24h
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
UPLOADS_DIR=/tmp/media-uploads
```

Si faltan variables JWT, el backend falla al arrancar (comportamiento esperado).

## 4) Flujo funcional mínimo

1. Registro de usuario `customer`: `POST /api/users/register`.
2. Verificación de email: `GET /api/users/verify?token=...`.
3. Login: `POST /api/users/login`.
4. Uso de endpoints protegidos con `Authorization: Bearer <JWT>`.

## 5) RBAC por endpoint

| Endpoint | super_admin | store_admin | catalog_manager | order_manager | customer |
|---|---|---|---|---|---|
| `GET /api/users` | Yes | Yes | No | No | No |
| `GET /api/users/:id` | Yes (con restricciones) | Yes (con restricciones) | Self only | Self only | Self only |
| `PUT /api/users/:id` | Yes | Yes (no sobre super_admin) | Self only | Self only | Self only |
| `PATCH /api/users/:id/password` | Self only | Self only | Self only | Self only | Self only |
| `DELETE /api/users/:id` | Yes | Yes (no sobre super_admin) | No | No | No |
| `POST /api/uploads/products-image` | Yes | Yes | Yes | No | No |

Nota:
- `store_admin` no puede gestionar cuentas `super_admin`.
- Ningún usuario puede cambiar su propio rol.

## 6) Formato estándar de errores

```json
{
  "ok": false,
  "error": {
    "status": 400,
    "code": "VALIDATION_ERROR",
    "message": "Descripcion del error",
    "details": {}
  }
}
```

Guía rápida:
- `400`: request inválida/validación.
- `401`: token faltante/inválido/expirado.
- `403`: autenticado pero sin permisos.
- `404`: recurso/ruta no encontrada.
- `409`: conflicto (email duplicado).
- `429`: límite de tasa excedido.
- `500`: error interno.

## 7) Ejemplos `curl`

Login:

```bash
curl -X POST http://localhost:5000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tienda.com","password":"123456"}'
```

Listar usuarios:

```bash
curl http://localhost:5000/api/users \
  -H "Authorization: Bearer <JWT>"
```

Subir imagen de producto:

```bash
curl -X POST http://localhost:5000/api/uploads/products-image \
  -H "Authorization: Bearer <JWT>" \
  -F "productImage=@/ruta/archivo.jpg"
```

## 8) Proceso de cambio de API

Cuando se modifica backend:

1. Actualizar endpoint/esquema en `backend/openapi.yaml`.
2. Actualizar contratos funcionales en `docs/notion-interface-contracts.md`.
3. Actualizar examples (`curl`) en este handbook si cambia el flujo.
4. Ejecutar pruebas smoke de BL-014.
5. Registrar cambio en Notion con impacto y versión.

## 9) Checklist de calidad para cerrar tareas de API

- OpenAPI actualizado y consistente con el código.
- Validaciones de payload cubiertas.
- RBAC aplicado al endpoint nuevo/modificado.
- Error codes estandarizados con `sendError`.
- Documentación de contrato actualizada en Notion.
- Smoke tests ejecutados en ambiente objetivo.
