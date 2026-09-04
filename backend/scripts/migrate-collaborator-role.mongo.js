// Uso:
// mongosh "mongodb://localhost:27017/duckhackdb" backend/scripts/migrate-collaborator-role.mongo.js
//
// Corrida única al desplegar la reestructuración de roles: catalog_manager y
// order_manager se consolidan en un solo rol "collaborator" (ver ROLES en
// packages/core-api/lib/authMiddleware.js). Sin esto, una cuenta con el rol
// viejo guardado en Mongo puede seguir logueando (el login no valida el rol
// contra el enum), pero cada request posterior le da 401 TOKEN_INVALID_ROLE
// porque el JWT ya trae un rol que dejó de existir.
// Idempotente: correrlo dos veces no hace nada la segunda vez (ya no quedan
// documentos con el rol viejo).
const catalogResult = db.users.updateMany({ role: "catalog_manager" }, { $set: { role: "collaborator" } });
const orderResult = db.users.updateMany({ role: "order_manager" }, { $set: { role: "collaborator" } });
print(`catalog_manager -> collaborator: ${catalogResult.modifiedCount}`);
print(`order_manager -> collaborator: ${orderResult.modifiedCount}`);
