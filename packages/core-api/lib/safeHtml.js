// HTML básico seguro para páginas que sirve el backend (legales de la app,
// modules/appProfile.js). Mismo criterio que RichText del storefront
// (DOMPurify con lista corta de etiquetas y sin atributos), sin dependencias:
// el texto se parte en etiquetas y texto; cada etiqueta permitida se vuelve a
// escribir desde cero (sin sus atributos, salvo un href seguro en <a>) y todo
// lo demás se descarta; en el texto se escapan < y >. Así nunca sale nada
// que no haya escrito esta función.
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "mark", "small", "sup", "sub", "br", "span",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "blockquote", "a",
]);
const VOID_TAGS = new Set(["br"]);
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)[^\s"'<>]*$/i;

const escapeText = (text) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const rebuildTag = (raw) => {
  // Etiqueta = "<" pegado al nombre (como en HTML); "a < b > c" es texto.
  const match = /^<(\/)?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/.exec(raw);
  if (!match) return /^<[!?]/.test(raw) ? "" : escapeText(raw);
  const [, closing, rawName, attrs] = match;
  const name = rawName.toLowerCase();
  if (!ALLOWED_TAGS.has(name)) return "";
  if (closing) return VOID_TAGS.has(name) ? "" : `</${name}>`;
  if (name === "a") {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const value = href ? (href[1] ?? href[2] ?? href[3] ?? "").trim() : "";
    return SAFE_HREF.test(value) ? `<a href="${escapeAttr(value)}" rel="noopener noreferrer">` : "<a>";
  }
  return `<${name}>`;
};

const sanitizeHtml = (html) => {
  const source = String(html || "")
    // El contenido de script/style no es texto visible: fuera completo.
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  let out = "";
  let last = 0;
  for (const match of source.matchAll(/<[^<>]*>/g)) {
    out += escapeText(source.slice(last, match.index));
    out += rebuildTag(match[0]);
    last = match.index + match[0].length;
  }
  return out + escapeText(source.slice(last));
};

// ¿Tiene texto visible? (para no publicar una página vacía).
const hasVisibleText = (html) => sanitizeHtml(html).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

const escapeHtml = (text) =>
  String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Texto plano de un HTML (sin etiquetas, entidades básicas resueltas, espacios
// colapsados) y recortado a `maxLength` en un límite de palabra, con "…" si se
// cortó. Para extractos en respuestas JSON (p. ej. productos del home de la app).
const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
const toPlainExcerpt = (html, maxLength = 160) => {
  const text = String(html || "")
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^<>]*>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (_, name) => ENTITIES[name.toLowerCase()])
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?¡¿-]+$/, "")}…`;
};

module.exports = { sanitizeHtml, hasVisibleText, escapeHtml, toPlainExcerpt };
