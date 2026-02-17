# BL-016 - Modelo de Dominio Ecommerce (Single-Instance)

## 1) Objetivo

Definir el modelo de dominio backend para el módulo ecommerce de una instancia (un cliente por despliegue), estableciendo entidades, relaciones, reglas de negocio y decisiones técnicas base para Semanas 3-4.

## 2) Alcance

Incluye:
- Entidades núcleo de catálogo: `StoreConfig`, `Category`, `Product`, `Inventory`.
- Relaciones entre entidades.
- Reglas mínimas de validación y consistencia.
- Convenciones de datos para implementación en MongoDB + Mongoose.

No incluye:
- Carrito y pedidos (se atenderán en Semanas 5-6).
- Promociones avanzadas, cupones, paquetería y analítica.
- Multi-tenant por `tenantId` dentro de la aplicación.

## 3) Contexto de arquitectura

- Modelo de despliegue: **single-tenant por instancia**.
- Cada cliente opera en su propio backend/frontend/base de datos.
- El aislamiento es por infraestructura, no por columna `tenantId` en documentos.

## 4) Entidades del dominio

## 4.1 StoreConfig

Propósito:
- Centralizar la configuración pública de la tienda para el storefront y panel admin.

Campos sugeridos:
- `storeName` (string, requerido)
- `storeSlug` (string, requerido, único por instancia)
- `contactEmail` (string)
- `contactPhone` (string)
- `logoUrl` (string)
- `theme` (object)
- `homeBlocks` (array de bloques configurables)
- `isActive` (boolean, default `true`)
- `createdAt`, `updatedAt`

Estructura `theme` sugerida:
- `primaryColor` (hex)
- `secondaryColor` (hex)
- `accentColor` (hex)
- `fontFamilyHeading` (string)
- `fontFamilyBody` (string)

Reglas:
- Debe existir una sola configuración activa principal por instancia.
- Valores de color deben validarse como hex.

## 4.2 Category

Propósito:
- Organizar productos del catálogo para navegación y filtros.

Campos sugeridos:
- `name` (string, requerido)
- `slug` (string, requerido, único)
- `description` (string)
- `sortOrder` (number, default `0`)
- `isActive` (boolean, default `true`)
- `createdBy` (ObjectId User)
- `updatedBy` (ObjectId User)
- `createdAt`, `updatedAt`

Reglas:
- `slug` único.
- No permitir nombre vacío.
- Soft disable con `isActive=false` antes de borrado físico (recomendado para MVP).

## 4.3 Product

Propósito:
- Representar artículos vendibles en la tienda.

Campos sugeridos:
- `name` (string, requerido)
- `slug` (string, requerido, único)
- `sku` (string, requerido, único)
- `description` (string)
- `price` (number, requerido, > 0)
- `compareAtPrice` (number, opcional, >= `price`)
- `categoryId` (ObjectId Category, requerido)
- `images` (array de strings de rutas/URLs)
- `status` (enum: `draft | active | archived`)
- `tags` (array string)
- `createdBy` (ObjectId User)
- `updatedBy` (ObjectId User)
- `createdAt`, `updatedAt`

Reglas:
- No publicar (`active`) sin `price`, `sku`, `slug`, `categoryId`.
- `price` y `compareAtPrice` no negativos.
- `images` acepta solo rutas generadas por endpoint de uploads.

## 4.4 Inventory

Propósito:
- Controlar existencias por producto.

Campos sugeridos:
- `productId` (ObjectId Product, requerido, único)
- `stockAvailable` (number, requerido, default `0`)
- `stockReserved` (number, requerido, default `0`)
- `reorderLevel` (number, default `0`)
- `lastAdjustmentReason` (string)
- `updatedBy` (ObjectId User)
- `createdAt`, `updatedAt`

Derivados:
- `stockOnHand = stockAvailable + stockReserved`

Reglas:
- `stockAvailable >= 0`
- `stockReserved >= 0`
- No permitir ajustes que dejen saldos negativos.

## 5) Relaciones del dominio

- `Category (1) -> (N) Product`
- `Product (1) -> (1) Inventory`
- `User (1) -> (N) Category/Product` por auditoría (`createdBy`, `updatedBy`)

Decisiones:
- `Inventory` separado de `Product` para facilitar auditoría y futuras reservas por pedidos.
- `Product` referencia `Category` por `categoryId`.

## 6) Convenciones técnicas (Mongo/Mongoose)

- Índices únicos:
  - `Category.slug`
  - `Product.slug`
  - `Product.sku`
  - `Inventory.productId`
- Todos los modelos con `timestamps: true`.
- Slugs normalizados (`lowercase`, `trim`, reemplazo de espacios por guiones).
- Borrado recomendado:
  - Categorías y productos con estrategia soft (`isActive`/`status`) para evitar pérdida accidental.

## 7) Reglas de acceso (RBAC esperado)

- Gestión de catálogo (`Category`, `Product`):
  - `super_admin`
  - `store_admin`
  - `catalog_manager`
- Ajustes de inventario:
  - `super_admin`
  - `store_admin`
  - `catalog_manager`
- Lectura de catálogo público:
  - Sin autenticación (solo productos `active` e `isActive=true`).

## 8) Criterios de aceptación BL-016

1. Documento publicado en Notion con entidades y relaciones definidas.
2. Reglas mínimas de negocio claras para implementación.
3. Decisión de arquitectura single-instance explícita (sin `tenantId`).
4. Base suficiente para arrancar BL-017, BL-018, BL-019 y BL-020 sin ambigüedad.

## 9) Pendientes para siguiente historia

- BL-017: modelar `StoreConfig` en código.
- BL-018: modelar `Category`.
- BL-019: modelar `Product`.
- BL-020: modelar `Inventory`.
