// src/hooks/useStoreConfig.jsx
//
// StoreConfig público (GET /api/store-config/public), una sola vez para todo
// el sitio. Nombre, logo, colores, horario, ubicación, equipo, testimonios,
// textos legales y las opciones de entrega/pago del checkout salen de aquí:
// todo se edita en "Configurar tienda" del admin.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiClient';

const StoreConfigContext = createContext({ config: null, isLoading: true, error: null });

const applyTheme = (theme) => {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.primaryColor) root.style.setProperty('--brand', theme.primaryColor);
  if (theme.accentColor) root.style.setProperty('--accent', theme.accentColor);
  if (theme.fontFamilyHeading) root.style.setProperty('--font-heading', theme.fontFamilyHeading);
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
        applyTheme(data?.theme);
        if (data?.storeName) document.title = data.storeName;
      })
      .catch((error) => {
        if (!cancelled) setState({ config: null, isLoading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <StoreConfigContext.Provider value={state}>{children}</StoreConfigContext.Provider>;
};

export const useStoreConfig = () => useContext(StoreConfigContext);

// Activos y en su orden del admin.
export const activeSorted = (list) =>
  (list || []).filter((item) => item && item.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
