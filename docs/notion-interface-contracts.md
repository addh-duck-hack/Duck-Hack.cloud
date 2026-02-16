# Contratos de Interfaz (Notion)

Base URL local: `http://localhost:5000`

## Convenciones

- Auth: `Bearer <JWT>` en header `Authorization`.
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
