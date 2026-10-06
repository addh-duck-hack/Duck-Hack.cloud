// Preferencias del Inicio del usuario (GET/PUT /api/dashboard/preferences,
// packages/core-api/modules/dashboard.js): tarjetas ocultas y su orden,
// bienvenida descartada y la última novedad leída. En contexto porque las
// usan el Inicio y el contador de novedades del menú (AdminShell.jsx).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { usePermissions } from "./usePermissions";
import { unreadIds, visibleChangelog } from "../changelog";

const EMPTY = { hidden: [], order: [], welcomeDismissed: false, changelogSeen: "" };
const DashboardPrefsContext = createContext({ prefs: EMPTY, loaded: false, save: async () => {}, unread: new Set(), changelog: [] });

export const DashboardPrefsProvider = ({ children }) => {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const [prefs, setPrefs] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    axios
      .get(`${getApiBaseUrl()}/api/dashboard/preferences`, { headers: headers() })
      .then(({ data }) => setPrefs({ ...EMPTY, ...data }))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Guarda solo lo que cambia; la vista se actualiza al momento.
  const save = useCallback(async (patch) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
    try {
      const { data } = await axios.put(`${getApiBaseUrl()}/api/dashboard/preferences`, patch, { headers: { ...headers(), "Content-Type": "application/json" } });
      setPrefs({ ...EMPTY, ...data });
    } catch {
      // se queda el cambio local; se reintenta con el siguiente guardado
    }
  }, []);

  const changelog = useMemo(() => (permissionsLoading ? [] : visibleChangelog(can)), [can, permissionsLoading]);
  const unread = useMemo(() => (loaded ? unreadIds(changelog, prefs.changelogSeen) : new Set()), [changelog, prefs.changelogSeen, loaded]);

  return <DashboardPrefsContext.Provider value={{ prefs, loaded, save, unread, changelog }}>{children}</DashboardPrefsContext.Provider>;
};

export const useDashboardPrefs = () => useContext(DashboardPrefsContext);
