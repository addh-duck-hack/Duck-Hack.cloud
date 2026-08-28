// Uso:
// mongosh "mongodb://localhost:27017/duckhackdb" backend/scripts/storeconfig-bootstrap.mongo.js

const now = new Date();

const storeConfigDoc = {
  singletonKey: "default",
  storeName: "Ecommerce Test Store",
  storeSlug: "ecommerce-test-store",
  contactEmail: "ecommerce@duck-hack.com",
  contactPhone: "+52 566 165 3418",
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
  socialLinks: {
    whatsapp: "",
    instagram: "",
    facebook: "",
    threads: "",
  },
  legalIdentity: {
    legalName: "",
    rfc: "",
    legalRepresentative: "",
    legalAddress: "",
    legalEmail: "",
    legalPhone: "",
  },
  heroSlides: [
    { title: "Bienvenido a tu tienda", description: "Personaliza este texto desde el panel de administración.", sortOrder: 1, isActive: true },
  ],
  metrics: [
    { value: "0", label: "Clientes activos", sortOrder: 1 },
  ],
  services: [
    { icon: "fas fa-cloud", route: "/servicios", title: "Servicio de ejemplo", description: "Describe aquí este servicio.", sortOrder: 1, isActive: true },
  ],
  pricingPlans: [
    {
      name: "Plan Básico",
      description: "Describe aquí este plan.",
      storage: "",
      emailAccounts: "",
      bandwidth: "",
      ssl: "",
      originalPrice: null,
      price: null,
      discountPercent: null,
      featured: false,
      extraFeaturesTitle: "",
      extraFeatures: [],
      sortOrder: 1,
      isActive: true,
    },
  ],
  commonPlanChecks: [],
  faqs: [
    { q: "¿Pregunta de ejemplo?", a: "Respuesta de ejemplo.", sortOrder: 1, isActive: true },
  ],
  teamMembers: [],
  testimonials: [],
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
