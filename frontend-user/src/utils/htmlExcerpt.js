// src/utils/htmlExcerpt.js
//
// Recorta una descripción con HTML (ver RichText.jsx) a `maxLength`
// caracteres de texto visible, conservando el formato de lo que sí entra
// (negritas, listas, etc.) — no es un slice del string crudo, que cortaría
// etiquetas a la mitad y dejaría HTML roto (ej. un <b> sin cerrar que le
// pone negritas a todo lo que sigue en la tarjeta).
//
// Uso: listados de producto (Shop.jsx) — la ficha completa (ProductDetail.jsx)
// sigue mostrando la descripción entera sin recortar.
import { sanitize } from '../components/RichText';

// Corta `text` a lo más `limit` caracteres, pero retrocediendo hasta el
// último espacio para no dejar una palabra a la mitad (ej. "piloncillo" no
// debe verse como "pil…"). Si el primer "espacio" queda demasiado cerca del
// inicio (una palabra/URL más larga que todo el límite), se usa el corte
// exacto de todos modos — un extracto casi vacío se ve peor que una palabra
// cortada, rarísima en descripciones reales.
const cutAtWordBoundary = (text, limit) => {
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > limit * 0.4) return slice.slice(0, lastSpace).trimEnd();
  return slice.trimEnd();
};

// Recorre el árbol y va restando `state.remaining` por cada nodo de texto;
// en cuanto se acaba, corta ahí y elimina todo lo que sigue (hermanos del
// nodo actual y de sus ancestros) para no dejar contenido huérfano.
const truncateNode = (node, state) => {
  Array.from(node.childNodes).forEach((child) => {
    if (state.done) {
      node.removeChild(child);
      return;
    }
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent.length <= state.remaining) {
        state.remaining -= child.textContent.length;
      } else {
        child.textContent = cutAtWordBoundary(child.textContent, state.remaining);
        state.done = true;
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      truncateNode(child, state);
    } else {
      // Comentarios u otros nodos que DOMPurify no elimina — no aportan
      // texto visible, se quitan para no dejar basura en el HTML final.
      node.removeChild(child);
    }
  });
};

export const htmlExcerpt = (html, maxLength = 140) => {
  const clean = sanitize(html);
  if (!clean) return '';

  const container = document.createElement('div');
  container.innerHTML = clean;

  if (container.textContent.length <= maxLength) return clean;

  truncateNode(container, { remaining: maxLength, done: false });
  return `${container.innerHTML}…`;
};

// Solo el texto visible de un campo con HTML básico (sanitizado igual que
// RichText): para subtítulos de una línea o citas, donde no se quiere formato.
export const htmlToText = (html) => {
  if (!html) return '';
  const container = document.createElement('div');
  container.innerHTML = sanitize(html);
  return container.textContent.trim();
};
