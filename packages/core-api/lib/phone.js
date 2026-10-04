// Teléfonos de México: 10 dígitos (la plataforma es principalmente para
// México). Una sola regla para todos los teléfonos que se capturan en el
// panel y en el storefront (usuarios, direcciones, pedidos, citas, datos de
// la tienda, SPEI, clientes de la agencia).
//
// Se aceptan espacios, guiones, paréntesis y el prefijo de país: "+52 (55)
// 1234-5678", "52 55 1234 5678" o "521 55…" (prefijo móvil viejo) se guardan
// como "5512345678". WhatsApp es la excepción en lo guardado: wa.me necesita
// el país, así que se guarda "52" + los 10 dígitos (ver toWhatsappPhone).

const MX_PHONE = /^\d{10}$/;

// Solo dígitos, sin el prefijo de país si venía.
const normalizeMxPhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) return digits.slice(3);
  return digits;
};

const isMxPhone = (digits) => MX_PHONE.test(digits);

// Valida un campo de teléfono. → { value } (normalizado; "" si es opcional y
// vino vacío) o { error } con un mensaje para el usuario.
const parseMxPhone = (value, { required = false, label = "El teléfono" } = {}) => {
  const digits = normalizeMxPhone(value);
  if (!digits) return required ? { error: `${label} es obligatorio (10 dígitos).` } : { value: "" };
  if (!isMxPhone(digits)) return { error: `${label} debe tener 10 dígitos (sin lada de país).` };
  return { value: digits };
};

// WhatsApp: 10 dígitos de México → "52XXXXXXXXXX" (lo que usa wa.me).
const toWhatsappPhone = (value, { label = "El número de WhatsApp" } = {}) => {
  const parsed = parseMxPhone(value, { label });
  if (parsed.error) return parsed;
  return { value: parsed.value ? `52${parsed.value}` : "" };
};

module.exports = { normalizeMxPhone, isMxPhone, parseMxPhone, toWhatsappPhone };
