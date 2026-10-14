// Perfil de la app móvil armado desde el admin (`/api/app-profile`, módulo
// de permisos "Configurar App" = `appConfig`, igual que modules/appHome.js).
// Singleton por despliegue. Sin documento guardado se usa DEFAULT_PROFILE, así
// que la app tiene un perfil razonable desde el primer día.
//
// Estructura: `groups` (cada uno con título = el separador: "Mi cuenta",
// "Soporte", "Legales"…) con `items` (opciones del menú) + dos botones fijos:
// cerrar sesión y calificar la app.
//
// Cada opción: `label`, `visibility` (always | auth = con sesión | guest = sin
// sesión) y `action`:
//   - screen   { screen }        pantalla de la app (SCREENS)
//   - phone    { phone? }        llamar; vacío = teléfono de contacto de la tienda
//   - whatsapp { phone?, message? } abrir WhatsApp; vacío = WhatsApp de la tienda
//   - email    { email? }        correo; vacío = correo de contacto de la tienda
//   - legal    { page }          privacy | legal | returns → página limpia del
//                                backend con el texto de Configurar tienda
//   - url      { url, openIn }   webview | browser
//
// GET /public resuelve cada acción a algo que la app solo tiene que abrir
// (`href`: tel:, https://wa.me/…, mailto:, URL) y QUITA las opciones que no
// aplican (pantalla de un módulo no contratado, tienda sin teléfono, legal sin
// texto). GET (admin) devuelve además `problems` por opción con el motivo, para
// avisarlo en el editor. La app debe ignorar acciones y pantallas que no
// conozca (versiones viejas).
//
// GET /legal/:page sirve el texto legal (HTML básico sanitizado con
// lib/safeHtml.js) en una página sencilla con el nombre, logo y color de la
// tienda, pensada para el web view de la app.
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const { asTrimmedString, getOrCreateModel } = require("../lib/moduleHelpers");
const { createModuleAuthorizer, loadPermissions } = require("../lib/permissions");
const { parseMxPhone } = require("../lib/phone");
const { sanitizeHtml, hasVisibleText, escapeHtml } = require("../lib/safeHtml");

const MAX_GROUPS = 10;
const MAX_ITEMS = 20;
const VISIBILITIES = ["always", "auth", "guest"];
const ACTION_TYPES = ["screen", "phone", "whatsapp", "email", "legal", "url"];
const OPEN_IN = ["webview", "browser"];

// Pantallas que la app sabe abrir. `module` = solo si la tienda lo tiene
// contratado; `auth` = visibilidad por defecto (con sesión).
const SCREENS = {
  login: { label: "Iniciar sesión / crear cuenta", auth: false },
  profile: { label: "Mis datos", auth: true },
  orders: { label: "Mis pedidos", auth: true, module: "orders" },
  addresses: { label: "Mis direcciones", auth: true },
  changePassword: { label: "Cambiar contraseña", auth: true },
  deleteAccount: { label: "Eliminar mi cuenta", auth: true },
  favorites: { label: "Mis favoritos", auth: true },
  loyalty: { label: "Mis puntos", auth: true, module: "loyalty" },
  giftCards: { label: "Mis tarjetas de regalo", auth: true, module: "giftCards" },
  reviews: { label: "Mis reseñas", auth: true, module: "reviews" },
  appointments: { label: "Mis citas", auth: true, module: "appointments" },
  notifications: { label: "Notificaciones", auth: true },
};

// Páginas legales: campo de StoreConfig y título.
const LEGAL_PAGES = {
  privacy: { field: "privacyNotice", title: "Aviso de privacidad" },
  legal: { field: "legalNotice", title: "Aviso legal" },
  returns: { field: "returnsPolicy", title: "Política de devoluciones" },
};

const item = (label, action, visibility) => ({ id: crypto.randomUUID(), label, visibility, action });
const DEFAULT_PROFILE = () => ({
  groups: [
    {
      id: crypto.randomUUID(),
      title: "Mi cuenta",
      items: [
        item("Iniciar sesión o crear cuenta", { type: "screen", screen: "login" }, "guest"),
        item("Mis datos", { type: "screen", screen: "profile" }, "auth"),
        item("Mis pedidos", { type: "screen", screen: "orders" }, "auth"),
        item("Mis direcciones", { type: "screen", screen: "addresses" }, "auth"),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "Soporte",
      items: [
        item("Llámanos", { type: "phone" }, "always"),
        item("Escríbenos por WhatsApp", { type: "whatsapp" }, "always"),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "Legales",
      items: [
        item("Aviso de privacidad", { type: "legal", page: "privacy" }, "always"),
        item("Aviso legal", { type: "legal", page: "legal" }, "always"),
        item("Política de devoluciones", { type: "legal", page: "returns" }, "always"),
      ],
    },
  ],
  logout: { enabled: true, label: "Cerrar sesión" },
  rateApp: { enabled: false, label: "Calificar la app", iosAppId: "", androidPackage: "" },
});

const appProfileSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, immutable: true },
    // Validados a mano (normalizeProfile); Mixed para no migrar al agregar campos.
    groups: { type: [mongoose.Schema.Types.Mixed], default: [] },
    logout: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    rateApp: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, minimize: false }
);

// ---- validación ----

class ProfileValidationError extends Error {}
const fail = (message) => {
  throw new ProfileValidationError(message);
};

const text = (value, field, max, { required = false } = {}) => {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") fail(`${field} debe ser texto.`);
  const out = value.trim();
  if (required && !out) fail(`${field} es obligatorio.`);
  if (out.length > max) fail(`${field} admite hasta ${max} caracteres.`);
  return out;
};

const normalizeAction = (raw, field) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`${field} debe ser un objeto.`);
  const type = asTrimmedString(raw.type);
  if (!ACTION_TYPES.includes(type)) fail(`${field}.type debe ser uno de: ${ACTION_TYPES.join(", ")}.`);
  if (type === "screen") {
    const screen = asTrimmedString(raw.screen);
    if (!SCREENS[screen]) fail(`${field}: elige una pantalla de la app.`);
    return { type, screen };
  }
  if (type === "phone" || type === "whatsapp") {
    const parsed = parseMxPhone(raw.phone, { label: `${field}: el teléfono` });
    if (parsed.error) fail(parsed.error);
    const out = { type, phone: parsed.value };
    if (type === "whatsapp") out.message = text(raw.message, `${field}.message`, 300);
    return out;
  }
  if (type === "email") {
    const email = text(raw.email, `${field}.email`, 160).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`${field}: el correo no es válido.`);
    return { type, email };
  }
  if (type === "legal") {
    const page = asTrimmedString(raw.page);
    if (!LEGAL_PAGES[page]) fail(`${field}: elige el texto legal.`);
    return { type, page };
  }
  const url = text(raw.url, `${field}.url`, 500, { required: true });
  if (!/^https?:\/\/\S+$/i.test(url)) fail(`${field}: la URL debe empezar con https://.`);
  const openIn = OPEN_IN.includes(raw.openIn) ? raw.openIn : "webview";
  return { type, url, openIn };
};

const normalizeProfile = (body) => {
  const groupsRaw = body?.groups;
  if (!Array.isArray(groupsRaw)) fail("groups debe ser un arreglo.");
  if (groupsRaw.length > MAX_GROUPS) fail(`Se admiten hasta ${MAX_GROUPS} grupos.`);
  const ids = new Set();
  const uniqueId = (value, field) => {
    const id = text(value, field, 40) || crypto.randomUUID();
    if (ids.has(id)) fail(`${field} "${id}" está repetido.`);
    ids.add(id);
    return id;
  };
  const groups = groupsRaw.map((g, gi) => {
    const gf = `Grupo ${gi + 1}`;
    if (!g || typeof g !== "object" || Array.isArray(g)) fail(`${gf} debe ser un objeto.`);
    const items = Array.isArray(g.items) ? g.items : fail(`${gf}: items debe ser un arreglo.`);
    if (items.length > MAX_ITEMS) fail(`${gf} admite hasta ${MAX_ITEMS} opciones.`);
    return {
      id: uniqueId(g.id, `${gf}.id`),
      title: text(g.title, `${gf}: el título`, 60),
      items: items.map((it, ii) => {
        const f = `${gf}, opción ${ii + 1}`;
        if (!it || typeof it !== "object" || Array.isArray(it)) fail(`${f} debe ser un objeto.`);
        const visibility = VISIBILITIES.includes(it.visibility) ? it.visibility : "always";
        return { id: uniqueId(it.id, `${f}.id`), label: text(it.label, `${f}: el texto`, 60, { required: true }), visibility, action: normalizeAction(it.action, f) };
      }),
    };
  });
  const logout = body?.logout || {};
  const rateApp = body?.rateApp || {};
  const iosAppId = text(rateApp.iosAppId, "El ID de App Store", 20);
  if (iosAppId && !/^\d{6,15}$/.test(iosAppId)) fail("El ID de App Store son solo números (ej. 1234567890).");
  const androidPackage = text(rateApp.androidPackage, "El paquete de Google Play", 150);
  if (androidPackage && !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(androidPackage)) fail("El paquete de Google Play debe verse como com.tienda.app.");
  const rateEnabled = Boolean(rateApp.enabled);
  if (rateEnabled && !iosAppId && !androidPackage) fail("Para \"Calificar la app\" escribe el ID de App Store o el paquete de Google Play.");
  return {
    groups,
    logout: { enabled: logout.enabled !== false, label: text(logout.label, "El texto de cerrar sesión", 40) || "Cerrar sesión" },
    rateApp: { enabled: rateEnabled, label: text(rateApp.label, "El texto de calificar", 40) || "Calificar la app", iosAppId, androidPackage },
  };
};

// ---- resolución ----

const backendUrl = () => (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");

// Contexto de la tienda que necesitan las acciones: contacto, legales y
// módulos contratados.
const loadContext = async (connection) => {
  const StoreConfig = connection.models.StoreConfig;
  const [config, permissions] = await Promise.all([
    StoreConfig ? StoreConfig.findOne({ singletonKey: "default" }).lean() : null,
    loadPermissions(connection),
  ]);
  return { config: config || {}, enabledModules: new Set(permissions.enabledModules) };
};

// Acción → { resolved } (lo que recibe la app) o { problem } (por qué no sale).
const resolveAction = (action, { config, enabledModules }) => {
  switch (action.type) {
    case "screen": {
      const screen = SCREENS[action.screen];
      if (screen.module && !enabledModules.has(screen.module)) return { problem: "La tienda no tiene contratado el módulo de esa pantalla." };
      return { resolved: { type: "screen", screen: action.screen } };
    }
    case "phone": {
      const phone = action.phone || config.contactPhone || "";
      if (!phone) return { problem: "No hay teléfono: escríbelo aquí o en Configurar tienda → Contacto." };
      return { resolved: { type: "phone", phone, href: `tel:+52${phone}` } };
    }
    case "whatsapp": {
      // Con lada 52 (whatsappButton ya la guarda así; los de 10 dígitos se completan).
      const own = action.phone ? `52${action.phone}` : "";
      const fromStore = config.whatsappButton?.phone || (config.contactPhone ? `52${config.contactPhone}` : "");
      const phone = own || fromStore;
      if (!phone) return { problem: "No hay WhatsApp: escríbelo aquí o en Configurar tienda." };
      const message = action.message || config.whatsappButton?.defaultMessage || "";
      return { resolved: { type: "whatsapp", phone, message, href: `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}` } };
    }
    case "email": {
      const email = action.email || config.contactEmail || "";
      if (!email) return { problem: "No hay correo: escríbelo aquí o en Configurar tienda → Contacto." };
      return { resolved: { type: "email", email, href: `mailto:${email}` } };
    }
    case "legal": {
      const page = LEGAL_PAGES[action.page];
      if (!hasVisibleText(config[page.field])) return { problem: `"${page.title}" está vacío: escríbelo en Configurar tienda → Identidad legal.` };
      const path = `/api/app-profile/legal/${action.page}`;
      return { resolved: { type: "legal", page: action.page, title: page.title, path, href: backendUrl() ? `${backendUrl()}${path}` : path, openIn: "webview" } };
    }
    case "url":
      return { resolved: { type: "url", href: action.url, openIn: action.openIn } };
    default:
      return { problem: "Acción no soportada." };
  }
};

const resolveRateApp = (rateApp) => {
  if (!rateApp?.enabled || (!rateApp.iosAppId && !rateApp.androidPackage)) return null;
  return {
    label: rateApp.label,
    iosUrl: rateApp.iosAppId ? `https://apps.apple.com/app/id${rateApp.iosAppId}?action=write-review` : null,
    androidUrl: rateApp.androidPackage ? `https://play.google.com/store/apps/details?id=${rateApp.androidPackage}` : null,
  };
};

// Página legal sencilla para el web view (estilos en línea; el backend no
// tiene CSP, es API). Tipografía del sistema y color de acento de la tienda.
const legalPageHtml = ({ title, body, storeName, logoUrl, accent }) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}${storeName ? ` · ${escapeHtml(storeName)}` : ""}</title>
<style>
  :root { color-scheme: light; --accent: ${accent}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 20px 48px; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; background: #ffffff; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  header img { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; }
  header span { font-weight: 600; color: #6b6b6b; }
  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 20px; padding-bottom: 12px; border-bottom: 3px solid var(--accent); }
  h2 { font-size: 1.15rem; margin: 28px 0 8px; }
  h3 { font-size: 1rem; margin: 20px 0 6px; }
  p, li { overflow-wrap: anywhere; }
  a { color: var(--accent); }
  blockquote { margin: 16px 0; padding-left: 14px; border-left: 3px solid #d9d9d9; color: #444; }
</style>
</head>
<body>
${logoUrl || storeName ? `<header>${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="">` : ""}${storeName ? `<span>${escapeHtml(storeName)}</span>` : ""}</header>` : ""}
<h1>${escapeHtml(title)}</h1>
<main>${body}</main>
</body>
</html>`;

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const AppProfile = getOrCreateModel(mongooseConnection, "AppProfile", appProfileSchema);
  const router = express.Router();

  // Perfil guardado o el de por defecto (isDefault = nunca se ha guardado).
  const loadProfile = async () => {
    const doc = await AppProfile.findOne({ singletonKey: "default" }).lean();
    if (!doc) return { ...DEFAULT_PROFILE(), isDefault: true, updatedAt: null };
    return { groups: doc.groups || [], logout: doc.logout || {}, rateApp: doc.rateApp || {}, isDefault: false, updatedAt: doc.updatedAt };
  };

  // ---- pública (app móvil) ----
  router.get("/public", async (req, res) => {
    try {
      const [profile, context] = await Promise.all([loadProfile(), loadContext(mongooseConnection)]);
      const groups = profile.groups
        .map((group) => ({
          id: group.id,
          title: group.title,
          items: group.items
            .map((it) => ({ it, result: resolveAction(it.action, context) }))
            .filter(({ result }) => result.resolved)
            .map(({ it, result }) => ({ id: it.id, label: it.label, visibility: it.visibility, action: result.resolved })),
        }))
        .filter((group) => group.items.length > 0);
      return res.status(200).json({
        groups,
        logout: profile.logout?.enabled === false ? null : { label: profile.logout?.label || "Cerrar sesión" },
        rateApp: resolveRateApp(profile.rateApp),
        updatedAt: profile.updatedAt,
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener el perfil de la app.");
    }
  });

  // Página legal para el web view de la app. 404 si la página no existe o
  // está vacía (la opción tampoco sale en /public).
  router.get("/legal/:page", async (req, res) => {
    try {
      const page = LEGAL_PAGES[req.params.page];
      if (!page) return sendError(res, 404, "LEGAL_PAGE_NOT_FOUND", "Página legal no encontrada.");
      const { config } = await loadContext(mongooseConnection);
      if (!hasVisibleText(config[page.field])) return sendError(res, 404, "LEGAL_PAGE_EMPTY", `"${page.title}" no está configurado.`);
      // La página la sirve este backend: una ruta de Medios relativa ya carga.
      const logoUrl = config.logoUrl ? (/^https?:\/\//i.test(config.logoUrl) ? config.logoUrl : `/${String(config.logoUrl).replace(/^\/+/, "")}`) : "";
      const accent = /^#[0-9a-f]{3,8}$/i.test(config.theme?.accentColor || "") ? config.theme.accentColor : "#333333";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(
        legalPageHtml({ title: page.title, body: sanitizeHtml(config[page.field]), storeName: config.storeName || "", logoUrl, accent })
      );
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al mostrar la página legal.");
    }
  });

  // ---- admin: módulo "Configurar App" ----
  router.use(verifyToken, createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("appConfig"));

  // Perfil + catálogos para el editor + `problems` (id de opción → por qué
  // no se mostrará hoy en la app).
  const editorResponse = async (profile) => {
    const context = await loadContext(mongooseConnection);
    const problems = {};
    for (const group of profile.groups) {
      for (const it of group.items) {
        const { problem } = resolveAction(it.action, context);
        if (problem) problems[it.id] = problem;
      }
    }
    return {
      ...profile,
      problems,
      screens: Object.entries(SCREENS).map(([key, s]) => ({ key, label: s.label, auth: s.auth, module: s.module || null })),
      legalPages: Object.entries(LEGAL_PAGES).map(([key, p]) => ({ key, title: p.title })),
      store: { contactPhone: context.config.contactPhone || "", contactEmail: context.config.contactEmail || "", whatsapp: context.config.whatsappButton?.phone || "" },
    };
  };

  router.get("/", async (req, res) => {
    try {
      return res.status(200).json(await editorResponse(await loadProfile()));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener el perfil de la app.");
    }
  });

  router.put("/", async (req, res) => {
    let profile;
    try {
      profile = normalizeProfile(req.body);
    } catch (error) {
      if (error instanceof ProfileValidationError) return sendError(res, 400, "VALIDATION_ERROR", error.message);
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al validar el perfil de la app.");
    }
    try {
      const doc = await AppProfile.findOneAndUpdate(
        { singletonKey: "default" },
        { $set: profile },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
      const saved = { groups: doc.groups, logout: doc.logout, rateApp: doc.rateApp, isDefault: false, updatedAt: doc.updatedAt };
      return res.status(200).json({ message: "Perfil de la app guardado.", ...(await editorResponse(saved)) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al guardar el perfil de la app.");
    }
  });

  app.use("/api/app-profile", router);
}

module.exports = {
  name: "appProfile",
  registerRoutes,
  models: { AppProfile: appProfileSchema },
  SCREENS,
  LEGAL_PAGES,
};
