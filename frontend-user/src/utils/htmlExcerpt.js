// src/utils/htmlExcerpt.js — extracto en texto plano de una descripción con
// HTML (servicios, productos), para las tarjetas de los listados. Se sanitiza
// con el mismo criterio que RichText antes de leer el texto, y el corte cae
// en un espacio para no partir palabras.
import { sanitize } from '../ui/RichText';

// Los cierres de bloque (</p>, </li>, <br>…) se vuelven espacios para que
// "…estilo.</p><p>Nuestro…" no quede pegado.
export const htmlToText = (html) => {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = sanitize(html).replace(/<\/(p|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, '$& ');
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
};

export const htmlExcerpt = (html, max = 150) => {
  const text = htmlToText(html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
};
