# BL-017 - Inicializacion de StoreConfig por instancia

## Objetivo

Registrar (o actualizar) el documento unico de `StoreConfig` para una nueva instancia ecommerce.

Coleccion objetivo en MongoDB:
- `storeconfigs`

Llave de control:
- `singletonKey = "default"`

## Query inicial (mongosh)

```javascript
const now = new Date();

db.storeconfigs.updateOne(
  { singletonKey: "default" },
  {
    $set: {
      singletonKey: "default",
      storeName: "Ecommerce Test Store",
      storeSlug: "ecommerce-test-store",
      contactEmail: "ecommerce@duck-hack.com",
      contactPhone: "+52 720 258 6341",
      logoUrl: "uploads/store-logo-default.png",
      theme: {
        primaryColor: "#043147",
        secondaryColor: "#04212f",
        accentColor: "#f8af11",
        fontFamilyHeading: "Montserrat",
        fontFamilyBody: "Lato",
      },
      homeBlocks: [
        {
          type: "hero",
          title: "Bienvenido a nuestra tienda",
          isActive: true,
          sortOrder: 1,
          payload: {
            headline: "Compra rapido y seguro",
            subheadline: "Productos destacados para tu negocio",
            ctaText: "Ver catalogo",
            ctaHref: "/catalogo"
          }
        },
        {
          type: "featured_products",
          title: "Productos destacados",
          isActive: true,
          sortOrder: 2,
          payload: { maxItems: 8 }
        }
      ],
      isActive: true,
      updatedAt: now
    },
    $setOnInsert: { createdAt: now }
  },
  { upsert: true }
);
```

## Script listo para usar

Archivo:
- `/Users/jacobo/Documents/Desarrollo Duck-Hack/Duck-Hack.cloud/backend/scripts/storeconfig-bootstrap.mongo.js`

Ejemplo de ejecucion:

```bash
mongosh "mongodb://localhost:27017/duckhackdb" /Users/jacobo/Documents/Desarrollo Duck-Hack/Duck-Hack.cloud/backend/scripts/storeconfig-bootstrap.mongo.js
```

## Verificacion

```javascript
db.storeconfigs.findOne({ singletonKey: "default" });
```

Validar:
1. Existe exactamente un documento principal.
2. `storeSlug` correcto para la instancia.
3. Colores en formato hex valido.
4. `homeBlocks` contiene bloques permitidos (`hero`, `featured_products`, `banners`, `rich_text`).

## Recomendaciones para nuevas instancias

1. Cambiar `storeName`, `storeSlug`, `contactEmail`, `logoUrl` antes de salir a staging.
2. Mantener `singletonKey = "default"` para conservar el patron de documento unico.
3. Versionar cambios de configuracion en Notion con fecha y responsable.

## Uso desde frontend-admin

Endpoints disponibles:
1. `GET /api/store-config` (admin, requiere JWT con rol `super_admin` o `store_admin`)
2. `PUT /api/store-config` (admin, requiere JWT con rol `super_admin` o `store_admin`)
3. `GET /api/store-config/public` (publico, para storefront)

Comportamiento esperado:
1. El admin carga la configuracion inicial desde DB.
2. Puede actualizar nombre, slug, contacto, logo y tema.
3. Los cambios quedan persistidos en el documento `singletonKey=default`.
