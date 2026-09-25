// src/utils/links.js
//
// Enlaces externos capturados en el admin (redes, testimonios...). Se piden
// completos, pero se tolera un dominio sin protocolo (recibe https://).
// Cualquier esquema que no sea http(s) (javascript:, data:...) se descarta y
// devuelve "".
export const externalHref = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  return /^https?:\/\//i.test(url) ? url : '';
};

// tel: solo con dígitos y "+" (el admin puede escribir "55 1234 5678").
export const telHref = (phone) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
};
