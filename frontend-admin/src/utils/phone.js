// Teléfonos de México a 10 dígitos — misma regla que el backend
// (packages/core-api/lib/phone.js): se quitan espacios, guiones y el prefijo
// de país (52 / 521) si viene pegado.
export const normalizeMxPhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) return digits.slice(3);
  return digits.slice(0, 10);
};

// "5512345678" → "55 1234 5678" (para mostrar).
export const formatMxPhone = (value) => {
  const d = normalizeMxPhone(value);
  return d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : value || "";
};
