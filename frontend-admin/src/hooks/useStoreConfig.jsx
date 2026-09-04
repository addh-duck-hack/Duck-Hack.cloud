// Fuente única de la configuración de tienda (StoreConfig) para el panel admin.
// `StoreConfigProvider` hace GET /api/store-config/public UNA sola vez (al
// montar App, envolviendo el Router) y comparte el resultado vía Context —
// hoy solo se usa para identificar la tienda (ej. "Panel administrativo de
// {storeName}" en Login.jsx), NUNCA para el tema visual: el panel es "Duck-Hack
// OS", el mismo software para todas las tiendas, y mantiene su propia paleta y
// tipografía fijas (ver src/index.css) sin importar lo que el store_admin
// configure en "Configuración de tienda" — esas fuentes/colores son para el
// storefront (frontend-user), no para el admin.
//
// Si el fetch falla o la tienda todavía no tiene StoreConfig (404), `config`
// queda en null.
import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const StoreConfigContext = createContext({ config: null, isLoading: true });

export const StoreConfigProvider = ({ children }) => {
  const [state, setState] = useState({ config: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;

    axios
      .get(`${getApiBaseUrl()}/api/store-config/public`)
      .then((res) => {
        if (cancelled) return;
        setState({ config: res.data, isLoading: false });
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
