# Duck-Hack CRM Base — Arquitectura v1 (Híbrida)

**Proyecto:** Duck-Hack CRM Base  
**Versión:** v1 (alineada a MVP congelado)  
**Fecha:** 2026-02-19  
**Estado:** Propuesta para ejecución

---

## 1) Decisión de arquitectura

Se adopta un modelo **híbrido**:

1. **Backend compartido (multi-tenant controlado)**
2. **Frontend Admin compartido (multi-tenant)**
3. **Frontend User por tienda (instancia independiente)**
4. **Persistencia Modelo B:** un clúster/servidor Mongo con:
   - una base global administrativa
   - una base de datos independiente por tienda

Esta decisión equilibra:
- reutilización del core,
- costos de mantenimiento,
- aislamiento de datos,
- personalización del storefront por cliente.

---

## 2) Contexto actual (baseline)

Backend actual expone principalmente:
- Auth/Users (`/api/users/*`)
- Mail (`/api/mail/send-email`)
- Uploads (`/api/uploads/products-image`, `/uploads/{fileName}`)

Referencia de contratos:
- `backend/openapi.yaml`

> Nota: catálogo/carrito/pedidos se implementan en MVP v1 con contexto tenant obligatorio.

---

## 3) Vista lógica de componentes

## 3.1 Componentes compartidos

### Backend API (shared)
Responsabilidades:
- autenticación y autorización (JWT + RBAC),
- resolución de tenant por request,
- conexión dinámica a DB de tienda,
- reglas de negocio del ecommerce,
- auditoría y observabilidad.

### Frontend Admin (shared)
Responsabilidades:
- login administrativo,
- selección de tienda activa,
- gestión de catálogo e inventario básico,
- gestión de pedidos por tienda.

## 3.2 Componentes por tienda

### Frontend User (dedicado por tienda)
Responsabilidades:
- catálogo público,
- detalle de producto,
- carrito y checkout básico,
- branding/theming de tienda,
- dominio independiente por cliente.

---

## 4) Modelo de datos (MongoDB — Modelo B)

## 4.1 Base global administrativa
**DB sugerida:** `duckhub_admin`

Colecciones sugeridas:
1. `tenants`
   - `tenantId` (string/uuid)
   - `slug` (único)
   - `storeName`
   - `status` (active/suspended)
   - `domains` (array)
   - `dbName` (único)
   - `plan`
   - `createdAt`, `updatedAt`
2. `admin_users`
3. `admin_user_tenant_roles`
   - `adminUserId`
   - `tenantId`
   - `role` (`super_admin`, `store_admin`, `catalog_manager`, `order_manager`)
4. `audit_logs`
5. `feature_flags` (opcional MVP)

## 4.2 Base por tienda
**DB sugerida por convención:** `store_<slug>`

Colecciones MVP:
1. `customers`
2. `products`
3. `categories`
4. `inventory`
5. `carts`
6. `orders`
7. `store_config` (branding/tema/config comercial)

Regla:
- Los datos comerciales de una tienda **solo** viven en su DB (`store_<slug>`).
- La DB global **no** guarda productos/pedidos.

---

## 5) Resolución de tenant (request lifecycle)

1. API recibe request.
2. Middleware `tenantResolver` identifica tenant por:
   - `Host` (dominio preferente en producción), o
   - `X-Tenant-Slug` (entorno local/testing).
3. Busca tenant activo en `duckhub_admin.tenants`.
4. Inyecta contexto en request (`req.tenant`).
5. Obtiene conexión a `store_<slug>` desde `dbConnectionManager`.
6. Ejecuta caso de uso sobre la DB de tienda.

Si falla resolución:
- responder `404 TENANT_NOT_FOUND` o `403 TENANT_INACTIVE`.

---

## 6) Seguridad y aislamiento

Controles obligatorios MVP:

1. **JWT firmado** (issuer/audience válidos).
2. **RBAC** en endpoints privados.
3. **Contexto tenant obligatorio** en endpoints de negocio.
4. **Autorización por tienda** en admin:
   - usuario debe tener rol asignado para el tenant activo.
5. **Validación de payloads** en todas las rutas críticas.
6. **No mezcla de datos por diseño** (DB independiente por tienda).
7. **Auditoría mínima** de acciones administrativas.

---

## 7) Contratos API (alineación OpenAPI)

## 7.1 Mantener contratos existentes
Se conservan contratos actuales en `openapi.yaml` y se versionan conforme se agreguen módulos MVP:
- `/api/users/*`
- `/api/mail/*`
- `/api/uploads/*`

## 7.2 Convenciones para nuevos endpoints MVP
Nuevos módulos:
- `/api/catalog/*`
- `/api/cart/*`
- `/api/orders/*`

Reglas de contrato:
1. Requerir contexto tenant (host o header en dev).
2. Mantener formato estándar de error:
   - `ok: false`
   - `error.status | error.code | error.message | error.details`
3. Documentar permisos por rol en cada endpoint.

---

## 8) Despliegue y dominios

## 8.1 Shared services
- 1 instancia backend shared
- 1 instancia front-admin shared

## 8.2 Storefront por tienda
- 1 instancia front-user por cliente
- dominio/subdominio propio por tienda
- variables por despliegue:
  - `STORE_SLUG`
  - `API_URL`
  - branding/theme básico

---

## 9) Operación, migraciones y backups

1. **Backups por tienda** (por DB `store_<slug>`).
2. **Restore granular por tienda**.
3. **Migraciones versionadas**:
   - scripts idempotentes,
   - ejecución controlada sobre todas las DB de tienda.
4. **Checklist de alta de tienda** documentado.

---

## 10) Riesgos técnicos + mitigación

1. Riesgo: fuga entre tenants por endpoint sin resolver tenant.  
   Mitigación: middleware global + tests de aislamiento.

2. Riesgo: crecimiento de conexiones Mongo por tienda.  
   Mitigación: connection pool manager con caché y límites.

3. Riesgo: deriva de contratos API.  
   Mitigación: OpenAPI como fuente de verdad + changelog.

4. Riesgo: crecimiento de alcance.  
   Mitigación: Freeze Rule vigente del MVP.

---

## 11) Backlog técnico inicial (orden recomendado)

1. Implementar `tenants` en DB global.
2. Crear `tenantResolver` + `dbConnectionManager`.
3. Adaptar auth admin a contexto tenant/roles por tienda.
4. Implementar módulo catálogo (products/categories/inventory) por tenant.
5. Implementar carrito por tenant.
6. Implementar pedidos por tenant.
7. Ajustar front-admin con selector de tienda.
8. Publicar primer front-user dedicado para tienda piloto.
9. Agregar pruebas de aislamiento A/B (dos tiendas de test).

---

## 12) Criterio de éxito técnico (MVP)

1. Con dos tiendas de prueba activas, no hay mezcla de datos entre ellas.
2. Front-admin opera catálogo/pedidos en contexto tenant.
3. Front-user por tienda consume API central correctamente.
4. Flujo e2e básico:
   - login admin,
   - alta producto,
   - compra en storefront,
   - consulta pedido en admin.

---

## 13) Decisiones cerradas (ADR resumen)

- **ADR-001:** Arquitectura híbrida aprobada (shared backend/admin + storefront por tienda).
- **ADR-002:** Modelo B de persistencia (DB global + DB por tienda).
- **ADR-003:** Tenant resolution por `Host` (prod) y `X-Tenant-Slug` (dev).
- **ADR-004:** Freeze de alcance MVP activo (cambios vía control formal).
