// src/hooks/usePageMeta.js
import { useEffect } from 'react';

const SITE_NAME = 'Café Tacita';
const DEFAULT_TITLE = `${SITE_NAME} — Café de altura, de Sutu Cha'Nu`;
const DEFAULT_DESCRIPTION =
  'Café de altura sembrado por manos totonacas en Xicotepec de Juárez, Puebla. De la planta a tu taza, sin intermediarios: tostado bajo pedido y enviado a todo México.';

const getMetaDescriptionTag = () => {
  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'description');
    document.head.appendChild(tag);
  }
  return tag;
};

/**
 * Actualiza document.title y la meta description para la ruta actual — cada
 * página llama a este hook con su propio título/descripción (SEO por página).
 * Sin argumentos, usa el título/descripción por defecto del sitio (home).
 */
export const usePageMeta = (title, description = DEFAULT_DESCRIPTION) => {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE;
    getMetaDescriptionTag().setAttribute('content', description);
  }, [title, description]);
};
