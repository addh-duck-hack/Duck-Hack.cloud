// INF-001 - Bootstrap de tenant + DB de tienda + StoreConfig inicial
//
// Uso (ejemplo):
// TENANT_SLUG=duck-hack \
// TENANT_NAME="Duck-Hack Store" \
// TENANT_DOMAIN="mx.duck-hack.cloud" \
// TENANT_CONTACT_EMAIL="a.jacobo@duck-hack.com" \
// TENANT_CONTACT_PHONE="+52 720 258 6341" \
// mongosh "mongodb://localhost:27017/duckhub_admin" backend/scripts/tenant-bootstrap.mongo.js
//
// Variables opcionales:
// TENANT_DB_NAME=store_duck_hack
// TENANT_STATUS=active
// TENANT_PLAN=starter
// TENANT_LOGO_URL=uploads/store-logo-default.png

(function () {
  const now = new Date();

  const slug = (process.env.TENANT_SLUG || "").trim().toLowerCase();
  const tenantName = (process.env.TENANT_NAME || "").trim();
  const tenantDomain = (process.env.TENANT_DOMAIN || "").trim().toLowerCase();

  if (!slug) {
    throw new Error("TENANT_SLUG es obligatorio");
  }

  if (!tenantName) {
    throw new Error("TENANT_NAME es obligatorio");
  }

  if (!tenantDomain) {
    throw new Error("TENANT_DOMAIN es obligatorio");
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("TENANT_SLUG solo acepta minúsculas, números y guiones");
  }

  const dbName = (process.env.TENANT_DB_NAME || `store_${slug.replace(/-/g, "_")}`).trim();
  const status = (process.env.TENANT_STATUS || "active").trim();
  const plan = (process.env.TENANT_PLAN || "starter").trim();

  const contactEmail = (process.env.TENANT_CONTACT_EMAIL || "store@duck-hack.com").trim().toLowerCase();
  const contactPhone = (process.env.TENANT_CONTACT_PHONE || "+52 000 000 0000").trim();
  const logoUrl = (process.env.TENANT_LOGO_URL || "uploads/store-logo-default.png").trim();

  const globalDb = db.getSiblingDB("duckhub_admin");
  const storeDb = db.getSiblingDB(dbName);

  // Índices mínimos para tenant registry
  globalDb.tenants.createIndex({ slug: 1 }, { unique: true });
  globalDb.tenants.createIndex({ dbName: 1 }, { unique: true });
  globalDb.tenants.createIndex({ domains: 1 }, { unique: true, sparse: true });

  const tenantDoc = {
    slug,
    storeName: tenantName,
    status,
    plan,
    dbName,
    domains: [tenantDomain],
    isActive: status === "active",
    updatedAt: now,
  };

  globalDb.tenants.updateOne(
    { slug },
    {
      $set: tenantDoc,
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  // Índices y StoreConfig inicial en DB de tienda
  storeDb.storeconfigs.createIndex({ singletonKey: 1 }, { unique: true });
  storeDb.storeconfigs.createIndex({ storeSlug: 1 }, { unique: true });

  const storeConfigDoc = {
    singletonKey: "default",
    storeName: tenantName,
    storeSlug: slug,
    contactEmail,
    contactPhone,
    logoUrl,
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
          headline: "Compra rápido y seguro",
          subheadline: "Productos destacados para tu negocio",
          ctaText: "Ver catálogo",
          ctaHref: "/catalogo",
        },
      },
      {
        type: "featured_products",
        title: "Productos destacados",
        isActive: true,
        sortOrder: 2,
        payload: {
          maxItems: 8,
        },
      },
    ],
    isActive: true,
    updatedAt: now,
  };

  storeDb.storeconfigs.updateOne(
    { singletonKey: "default" },
    {
      $set: storeConfigDoc,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  print("✅ Tenant bootstrap aplicado correctamente");
  print(`- Tenant slug: ${slug}`);
  print(`- Tenant DB: ${dbName}`);
  print(`- Dominio: ${tenantDomain}`);
  print("\nTenant registry:");
  printjson(globalDb.tenants.findOne({ slug }));
  print("\nStoreConfig:");
  printjson(storeDb.storeconfigs.findOne({ singletonKey: "default" }));
})();
