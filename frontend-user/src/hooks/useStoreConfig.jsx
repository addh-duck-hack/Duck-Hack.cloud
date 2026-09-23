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

// Mapeo theme -> tokens CSS (ver src/index.css): color primario (fondo de la
// barra superior fija), color de acento (+ su color de texto legible) y las
// dos familias tipográficas. Las fuentes que el admin configure reemplazan a las
// temporales de diseño (Roboto / Roboto Condensed, cargadas en index.html).
// secondaryColor todavía no se mapea.

// Familias que ya vienen embebidas vía index.html o que son genéricas de CSS
// — no hay que pedirlas a Google Fonts.
const BUNDLED_FONTS = new Set(['roboto', 'roboto condensed']);
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

// Luminancia relativa WCAG de un color HEX (#rgb o #rrggbb); null si no es válido.
const hexLuminance = (hex) => {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Texto legible sobre un fondo dado: blanco o casi negro, el que dé más
// contraste. Se usa para el texto de los botones con fondo de acento.
export const readableTextOn = (hex) => {
  const lum = hexLuminance(hex);
  if (lum === null) return '#ffffff';
  const contrastWithWhite = 1.05 / (lum + 0.05);
  const contrastWithDark = (lum + 0.05) / 0.06;
  return contrastWithWhite >= contrastWithDark ? '#ffffff' : '#1a1a1a';
};

const applyStoreTheme = (theme) => {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.primaryColor) root.style.setProperty('--color-primary', theme.primaryColor);
  if (theme.accentColor) {
    root.style.setProperty('--color-accent', theme.accentColor);
    root.style.setProperty('--color-on-accent', readableTextOn(theme.accentColor));
  }
  if (theme.fontFamilyHeading) {
    root.style.setProperty('--font-heading', withFallback(theme.fontFamilyHeading, 'sans-serif'));
  }
  if (theme.fontFamilyBody) {
    root.style.setProperty('--font-body', withFallback(theme.fontFamilyBody, 'sans-serif'));
  }
  syncStoreFontLink([theme.fontFamilyHeading, theme.fontFamilyBody]);
};

// El favicon del navegador (pestaña) se deja estático (index.html,
// /favicon.ico) a propósito — solo el logo dentro de la propia página sigue
// el logoUrl del admin (vía resolveStoreImageUrl).

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
