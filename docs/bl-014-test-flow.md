# BL-014 - Pruebas del Flujo Actual

## Objetivo

Validar de forma rápida el flujo actual de seguridad y comportamiento base del backend:
- auth/rbac
- cors
- validaciones de payload
- endpoints sensibles de uploads y usuarios

## Script de smoke tests

Archivo:
- `/Users/jacobo/Documents/Desarrollo Duck-Hack/Duck-Hack.cloud/backend/scripts/bl014-smoke-tests.sh`

### Ejecución mínima

```bash
BASE_URL=http://localhost:5000 \
ALLOWED_ORIGIN=http://localhost:3000 \
BLOCKED_ORIGIN=https://blocked.example \
bash /Users/jacobo/Documents/Desarrollo Duck-Hack/Duck-Hack.cloud/backend/scripts/bl014-smoke-tests.sh
```

### Ejecución completa (incluyendo RBAC con tokens)

```bash
BASE_URL=https://api.tu-dominio.com \
ALLOWED_ORIGIN=https://admin.tu-dominio.com \
BLOCKED_ORIGIN=https://blocked.example \
CUSTOMER_TOKEN="jwt_customer" \
STAFF_TOKEN="jwt_store_admin_o_super_admin" \
CUSTOMER_ID="mongodb_object_id_customer" \
bash /Users/jacobo/Documents/Desarrollo Duck-Hack/Duck-Hack.cloud/backend/scripts/bl014-smoke-tests.sh
```

## Casos validados por el script

1. Ruta inexistente responde `404`.
2. `GET /api/users` sin token responde `401`.
3. CORS bloquea origen no permitido con `403`.
4. CORS no bloquea origen permitido (no responde `403` por CORS).
5. `POST /api/users/login` con payload inválido responde `400`.
6. `POST /api/users/register` con payload inválido responde `400`.
7. `POST /api/uploads/products-image` sin token responde `401`.
8. `POST /api/uploads/products-image` con token customer responde `403` (si se provee token).
9. `GET /api/users` con token staff responde `200` (si se provee token).
10. `PATCH /api/users/:id/password` valida payload y responde `400` si es inválido (si se proveen datos de usuario).

## Criterio de aceptación BL-014

- El script termina con `PASS` en todos los casos ejecutados.
- `FAIL: 0`.
- Los casos `SKIP` solo aplican si faltan variables opcionales (`CUSTOMER_TOKEN`, `STAFF_TOKEN`, `CUSTOMER_ID`).
