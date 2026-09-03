// src/hooks/useStoreConfig.js
//
// Fuente única de la configuración de tienda (StoreConfig) para todo el
// storefront. `StoreConfigProvider` hace GET /api/store-config/public UNA
// sola vez (al montar App, envolviendo el Router) y comparte el resultado
// vía Context — así ningún componente vuelve a pedirlo al navegar entre
// rutas.
//
// Regla de fallback: mientras carga, si el fetch falla, o si el backend no
// responde, `config` queda en null — cada componente de contenido es
// responsable de usar su propio array/constante hardcodeada como fallback
// (`config?.campo?.length ? config.campo : FALLBACK_LOCAL`), para que el
// sitio nunca se muestre roto o vacío.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../utils/apiClient';

const StoreConfigContext = createContext({ config: null, isLoading: true, error: null });

// Helper compartido: arma la URL absoluta de una imagen guardada por el
// backend (path relativo tipo "uploads/xxx.jpg"). Devuelve "" si no hay path,
// para que el llamador decida su propio fallback local (import estático).
export const resolveStoreImageUrl = (relativePath) => {
  if (!relativePath) return '';
  return `${getApiBaseUrl()}/${relativePath}`;
};

// Mapeo conservador theme -> tokens CSS: solo el color de acento y las
// fuentes en esta primera iteración. primaryColor/secondaryColor tocan
// fondos completos del sitio y requieren validar contraste antes de
// exponerlos aquí (ver plan de "store config dinámico").

// Familias que ya vienen embebidas vía index.html (Actor / Meow Script /
// Fraunces) o que son genéricas de CSS — no hay que pedirlas a Google Fonts.
const BUNDLED_FONTS = new Set(['actor', 'meow script', 'fraunces']);
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  'inherit', 'initial', 'unset', 'revert',
]);

// "'Playfair Display', serif" -> "Playfair Display"
const primaryFamily = (value) =>
  String(value || '').split(',')[0].trim().replace(/^["']|["']$/g, '').trim();

// Si el admin escribió solo el nombre de la familia (sin pila de fallback),
// se le agrega un genérico para que se vea algo decente mientras Google Fonts
// carga o si la fuente no existe.
const withFallback = (value, generic) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes(',') ? raw : `"${primaryFamily(raw)}", ${generic}`;
};

// Carga dinámica de Google Fonts para lo que el admin haya puesto en
// theme.fontFamilyHeading / fontFamilyBody. Se usa la API v1 (/css?family=...)
// a propósito: tolera pesos que la fuente no tenga (css2 devuelve 400 y no
// carga nada). Si la familia no existe en Google Fonts el <link> simplemente
// no aplica y el CSS cae al fallback de withFallback().
const syncStoreFontLink = (families) => {
  const wanted = [...new Set(families.map(primaryFamily).filter(Boolean))].filter(
    (f) => !GENERIC_FAMILIES.has(f.toLowerCase()) && !BUNDLED_FONTS.has(f.toLowerCase())
  );
  const LINK_ID = 'storeconfig-fonts';
  const existing = document.getElementById(LINK_ID);

  if (wanted.length === 0) {
    if (existing) existing.remove();
    return;
  }

  const spec = wanted.map((f) => `${f.replace(/\s+/g, '+')}:300,400,400i,500,600,700`).join('|');
  const href = `https://fonts.googleapis.com/css?family=${spec}&display=swap`;

  if (existing) {
    if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
    return;
  }
  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
};

const applyStoreTheme = (theme) => {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.accentColor) root.style.setProperty('--action', theme.accentColor);
  if (theme.fontFamilyHeading) {
    root.style.setProperty(
      '--font-mono',
      withFallback(theme.fontFamilyHeading, '"Trebuchet MS", Arial, sans-serif')
    );
  }
  if (theme.fontFamilyBody) {
    root.style.setProperty('--font-body', withFallback(theme.fontFamilyBody, 'Georgia, serif'));
  }
  syncStoreFontLink([theme.fontFamilyHeading, theme.fontFamilyBody]);
};

// El favicon del navegador (pestaña) se deja estático (index.html,
// /favicon.ico) a propósito — solo el logo dentro de la propia página (rail
// lateral, footer, pantalla de carga) sigue el logoUrl del admin, ver
// AppShell/Footer/Loader/etc. usando resolveStoreImageUrl.

export const StoreConfigProvider = ({ children }) => {
  const [state, setState] = useState({ config: null, isLoading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    apiFetch('/api/store-config/public')
      .then((data) => {
        if (cancelled) return;
        setState({ config: data, isLoading: false, error: null });
        applyStoreTheme(data?.theme);
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ config: null, isLoading: false, error: err });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <StoreConfigContext.Provider value={state}>{children}</StoreConfigContext.Provider>;
};

export const useStoreConfig = () => useContext(StoreConfigContext);

// Handler compartido para el `onError` de un <img> que usa resolveStoreImageUrl
// (logo, fotos de equipo/clientes): si la imagen personalizada ya no resuelve
// (archivo borrado del servidor, subida perdida en un redeploy sin volumen
// persistente para UPLOADS_DIR, URL editada a mano con un typo en StoreConfig),
// cae automáticamente al asset local en vez de dejar el ícono de imagen rota
// del navegador. Se limpia el propio onerror antes de reasignar el src para no
// entrar en bucle si el fallback también fallara.
export const handleImageFallback = (fallbackSrc) => (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = fallbackSrc;
};
