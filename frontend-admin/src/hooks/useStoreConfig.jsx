// Fuente única de la configuración de tienda (StoreConfig) para el panel admin.
// `StoreConfigProvider` hace GET /api/store-config/public UNA sola vez (al
// montar App, envolviendo el Router) y comparte el resultado vía Context, y de
// paso aplica el tema visual (colores/fuentes que el store_admin edita en
// "Configuración de tienda") sobre los tokens CSS del panel.
//
// Si el fetch falla o la tienda todavía no tiene StoreConfig (404), `config`
// queda en null y el panel se queda con la paleta Duck-Hack por defecto.
import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const StoreConfigContext = createContext({ config: null, isLoading: true });

// Texto legible (oscuro/claro) sobre un fondo HEX, según luminancia relativa
// (WCAG). Evita que un color de acento oscuro deje el texto del botón ilegible.
const readableTextOn = (hex) => {
  const match = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.4 ? "#03141c" : "#f3f9ff";
};

// Aclara un HEX mezclándolo hacia blanco, para tener un color de hover que dé
// feedback aunque el store_admin solo configure un color de acento.
const lighten = (hex, amount = 0.16) => {
  const match = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!match) return hex;
  const int = parseInt(match[1], 16);
  const mixed = [(int >> 16) & 255, (int >> 8) & 255, int & 255]
    .map((c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0"))
    .join("");
  return `#${mixed}`;
};

// Mapeo conservador StoreConfig.theme -> tokens CSS del admin. Mismo criterio
// que frontend-user/src/hooks/useStoreConfig.jsx: solo el color de acento
// (botones/CTA/enlaces destacados) y las fuentes. primaryColor/secondaryColor
// tocan fondos completos y siguen pendientes de validar contraste antes de
// aplicarlos (ver la nota en StoreConfigManager).
const applyAdminTheme = (theme) => {
  if (!theme) return;
  const root = document.documentElement;

  if (theme.accentColor) {
    root.style.setProperty("--primary-color", theme.accentColor);
    root.style.setProperty("--primary-hover-color", lighten(theme.accentColor));
    const onAccent = readableTextOn(theme.accentColor);
    if (onAccent) root.style.setProperty("--on-accent", onAccent);
  }
  if (theme.fontFamilyHeading) root.style.setProperty("--font-mono", theme.fontFamilyHeading);
  if (theme.fontFamilyBody) root.style.setProperty("--font-body", theme.fontFamilyBody);
};

export const StoreConfigProvider = ({ children }) => {
  const [state, setState] = useState({ config: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;

    axios
      .get(`${getApiBaseUrl()}/api/store-config/public`)
      .then((res) => {
        if (cancelled) return;
        setState({ config: res.data, isLoading: false });
        applyAdminTheme(res.data?.theme);
      })
      .catch(() => {
        if (!cancelled) setState({ config: null, isLoading: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <StoreConfigContext.Provider value={state}>{children}</StoreConfigContext.Provider>;
};

export const useStoreConfig = () => useContext(StoreConfigContext);
