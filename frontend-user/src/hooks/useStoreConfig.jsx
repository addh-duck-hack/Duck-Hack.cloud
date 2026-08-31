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

// Mapeo conservador theme -> tokens CSS: solo el color de acento y las
// fuentes en esta primera iteración. primaryColor/secondaryColor tocan
// fondos completos del sitio y requieren validar contraste antes de
// exponerlos aquí (ver plan de "store config dinámico").
const applyStoreTheme = (theme) => {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.accentColor) root.style.setProperty('--action', theme.accentColor);
  if (theme.fontFamilyHeading) root.style.setProperty('--font-mono', theme.fontFamilyHeading);
  if (theme.fontFamilyBody) root.style.setProperty('--font-body', theme.fontFamilyBody);
};

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

// Helper compartido: arma la URL absoluta de una imagen guardada por el
// backend (path relativo tipo "uploads/xxx.jpg"). Devuelve "" si no hay path,
// para que el llamador decida su propio fallback local (import estático).
export const resolveStoreImageUrl = (relativePath) => {
  if (!relativePath) return '';
  return `${getApiBaseUrl()}/${relativePath}`;
};

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
