// Uso:
// mongosh "mongodb://localhost:27017/duckhackdb" backend/scripts/storeconfig-bootstrap.mongo.js

const now = new Date();

const storeConfigDoc = {
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

db.storeconfigs.updateOne(
  { singletonKey: "default" },
  {
    $set: storeConfigDoc,
    $setOnInsert: { createdAt: now },
  },
  { upsert: true }
);

print("StoreConfig bootstrap aplicado.");
printjson(db.storeconfigs.findOne({ singletonKey: "default" }));
