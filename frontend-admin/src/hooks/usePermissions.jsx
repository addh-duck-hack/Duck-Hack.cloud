// Módulos que puede usar la sesión actual (GET /api/permissions/me, ver
// packages/core-api/modules/permissions.js). Se piden una vez al montar la app
// — el login recarga la página, así que siempre corresponden al token vigente —
// y los consumen App.jsx (qué rutas existen) y AdminShell.jsx (qué aparece en
// el menú). El backend los hace cumplir de todos modos: esto solo evita
// mostrar lo que respondería 403.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { ROLES, STAFF_ROLES } from "../utils/roles";

const PermissionsContext = createContext({ modules: [], isLoading: false, error: "", can: () => false, reload: () => {} });

export const PermissionsProvider = ({ children }) => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const isStaff = !!token && STAFF_ROLES.includes(role);
  const [state, setState] = useState({ modules: [], isLoading: isStaff, error: "" });

  const load = useCallback(async () => {
    if (!isStaff) return;
    setState((current) => ({ ...current, isLoading: true, error: "" }));
    try {
      const response = await axios.get(`${getApiBaseUrl()}/api/permissions/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setState({ modules: response.data?.modules || [], isLoading: false, error: "" });
    } catch (err) {
      setState({
        modules: [],
        isLoading: false,
        error: err.response?.data?.error?.message || "No fue posible cargar tus permisos.",
      });
    }
  }, [isStaff, token]);

  useEffect(() => {
    load();
  }, [load]);

  // super_admin siempre ve todo, aunque /me aún no haya respondido o falle.
  const can = useCallback((key) => role === ROLES.SUPER_ADMIN || state.modules.includes(key), [role, state.modules]);

  return <PermissionsContext.Provider value={{ ...state, can, reload: load }}>{children}</PermissionsContext.Provider>;
};

export const usePermissions = () => useContext(PermissionsContext);
