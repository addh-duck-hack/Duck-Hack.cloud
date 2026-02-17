# Contratos de Interfaz (Notion)

Base URL local: `http://localhost:5000`

## Convenciones

- Auth: `Bearer <JWT>` en header `Authorization`.
- JWT restringido por backend:
  - Algoritmo permitido: `HS256`.
  - Claims obligatorios en validación: `iss` (`JWT_ISSUER`) y `aud` (`JWT_AUDIENCE`).
  - Tipo de token (`tokenType`) requerido:
    - `access` para endpoints autenticados.
    - `email_verification` para `/api/users/verify`.
- Error estándar:

```json
{
  "ok": false,
  "error": {
    "status": 400,
    "code": "VALIDATION_ERROR",
    "message": "Descripcion"
  }
}
```

## Rate Limit (BL-013-ST001)

| Endpoint | Ventana | Límite por IP | Código 429 |
|---|---:|---:|---|
| `POST /api/users/register` | 15 minutos | 10 requests | `RATE_LIMIT_REGISTER_EXCEEDED` |
| `POST /api/users/login` | 15 minutos | 20 requests | `RATE_LIMIT_LOGIN_EXCEEDED` |
| `POST /api/mail/send-email` | 10 minutos | 8 requests | `RATE_LIMIT_CONTACT_EXCEEDED` |

Headers de respuesta relevantes:
- `Retry-After`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

Ejemplo de error 429:

```json
{
  "ok": false,
  "error": {
    "status": 429,
    "code": "RATE_LIMIT_LOGIN_EXCEEDED",
    "message": "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
    "details": {
      "retryAfterSec": 120
    }
  }
}
```

## Matriz de endpoints

| ID | Método | Endpoint | Auth | Descripción |
|---|---|---|---|---|
| AUTH-001 | POST | `/api/users/register` | No | Registro de usuario público (rol `customer`) |
| AUTH-002 | GET | `/api/users/verify?token=...` | No | Verificación de cuenta por token |
| AUTH-003 | POST | `/api/users/login` | No | Inicio de sesión |
| USER-001 | GET | `/api/users` | Sí | Listar usuarios (staff autorizado) |
| USER-002 | GET | `/api/users/:id` | Sí | Obtener usuario (self o admin autorizado) |
| USER-003 | PUT | `/api/users/:id` | Sí | Actualizar datos del usuario (sin email) |
| USER-004 | PATCH | `/api/users/:id/password` | Sí | Cambio de contraseña (solo self) |
| USER-005 | DELETE | `/api/users/:id` | Sí | Eliminar usuario (staff autorizado) |
| MAIL-001 | POST | `/api/mail/send-email` | No | Envío de correo de contacto |
| UPLOAD-001 | POST | `/api/uploads/products-image` | Sí | Subir imagen de producto (JPG/PNG) |
| FILE-001 | GET | `/uploads/:fileName` | No | Lectura de archivo estático subido |

## Contratos request/response

### AUTH-001 - Register
**Request**
```json
{
  "name": "Juan Perez",
  "email": "juan@correo.com",
  "password": "123456"
}
```

**Response 201**
```json
{
  "message": "Usuario registrado con éxito. Revisa tu correo para verificar la cuenta.",
  "user": {
    "_id": "65f1...",
    "name": "Juan Perez",
    "email": "juan@correo.com",
    "role": "customer",
    "profileImage": null,
    "isVerified": false,
    "createdAt": "2026-02-16T10:00:00.000Z"
  }
}
```

### AUTH-002 - Verify
**Request**
- Query param: `token=<jwt>`

**Response 200**
```json
{
  "message": "Usuario verificado correctamente"
}
```

### AUTH-003 - Login
**Request**
```json
{
  "email": "juan@correo.com",
  "password": "123456"
}
```

**Response 200**
```json
{
  "message": "Inicio de sesión exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
  "user": {
    "_id": "65f1...",
    "name": "Juan Perez",
    "email": "juan@correo.com",
    "role": "customer",
    "profileImage": null,
    "isVerified": true,
    "createdAt": "2026-02-16T10:00:00.000Z"
  }
}
```

### USER-001 - List Users
**Headers**
- `Authorization: Bearer <JWT>`

**Response 200**
```json
[
  {
    "_id": "65f1...",
    "name": "Admin Tienda",
    "email": "admin@tienda.com",
    "role": "store_admin",
    "isVerified": true,
    "createdAt": "2026-02-16T10:00:00.000Z"
  }
]
```

### USER-002 - Get User by ID
**Headers**
- `Authorization: Bearer <JWT>`

**Response 200**
```json
{
  "_id": "65f1...",
  "name": "Juan Perez",
  "email": "juan@correo.com",
  "role": "customer",
  "profileImage": "uploads/profileImage-123.png",
  "isVerified": true,
  "createdAt": "2026-02-16T10:00:00.000Z"
}
```

### USER-003 - Update User
**Headers**
- `Authorization: Bearer <JWT>`
- `Content-Type: multipart/form-data`

**Request (campos opcionales)**
- `name` (string)
- `role` (`super_admin` | `store_admin` | `catalog_manager` | `order_manager` | `customer`)*
- `profileImage` (file)

`*` El cambio de rol depende de RBAC y restricciones del actor.

**Response 200**
```json
{
  "message": "Usuario actualizado correctamente",
  "user": {
    "_id": "65f1...",
    "name": "Nuevo Nombre",
    "email": "juan@correo.com",
    "role": "customer",
    "profileImage": "uploads/profileImage-123.png",
    "isVerified": true,
    "createdAt": "2026-02-16T10:00:00.000Z"
  }
}
```

### USER-004 - Change Password
**Headers**
- `Authorization: Bearer <JWT>`

**Request**
```json
{
  "currentPassword": "123456",
  "newPassword": "12345678"
}
```

**Response 200**
```json
{
  "message": "Contraseña actualizada correctamente."
}
```

### USER-005 - Delete User
**Headers**
- `Authorization: Bearer <JWT>`

**Response 200**
```json
{
  "message": "Usuario eliminado correctamente",
  "user": {
    "_id": "65f1...",
    "name": "Usuario Eliminado",
    "email": "user@correo.com",
    "role": "customer",
    "profileImage": null,
    "isVerified": true,
    "createdAt": "2026-02-16T10:00:00.000Z"
  }
}
```

### MAIL-001 - Send Contact Email
**Request**
```json
{
  "fullName": "Cliente Demo",
  "email": "cliente@correo.com",
  "phone": "5551234567",
  "service": "ecommerce",
  "message": "Quiero información para implementar mi tienda."
}
```

**Response 200**
```json
{
  "message": "Email enviado"
}
```

### UPLOAD-001 - Upload Product Image
**Headers**
- `Authorization: Bearer <JWT>`
- `Content-Type: multipart/form-data`

**Roles permitidos**
- `super_admin`
- `store_admin`
- `catalog_manager`

**Request (form-data)**
- `productImage` (file) obligatorio, JPG o PNG, máximo 5MB.

**Response 201**
```json
{
  "message": "Imagen de producto subida correctamente.",
  "imagePath": "uploads/productImage-1718282784-uuid.jpg"
}
```
