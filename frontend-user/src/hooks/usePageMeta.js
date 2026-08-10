// src/hooks/usePageMeta.js
import { useEffect } from 'react';

const SITE_NAME = 'Duck-Hack';
const DEFAULT_TITLE = `${SITE_NAME} — Hosting, Desarrollo Web y Apps a la Medida`;
const DEFAULT_DESCRIPTION =
  'Hosting, desarrollo web, apps nativas y servicios en la nube a la medida de tu negocio. Planes de hosting desde $250 MXN/mes, con soporte técnico en español.';

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
