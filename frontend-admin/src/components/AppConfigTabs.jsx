import React from "react";
import { NavLink } from "react-router-dom";

// Sub-navegación de "Configurar App" (módulo "appConfig") — mismo patrón que
// StoreConfigTabs. Cada configuración nueva de la app móvil agrega aquí su
// pestaña y su ruta en App.jsx bajo /admin/app-config/.
const TABS = [
  { path: "/admin/app-config/home", label: "Home" },
  { path: "/admin/app-config/profile", label: "Perfil" },
];

const AppConfigTabs = () => (
  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem", borderBottom: "1px solid var(--input-border-color)", paddingBottom: "0.75rem" }}>
    {TABS.map((tab) => (
      <NavLink
        key={tab.path}
        to={tab.path}
        className={({ isActive }) => `btn-secondary${isActive ? " active" : ""}`}
        style={({ isActive }) => ({
          width: "auto",
          textDecoration: "none",
          fontWeight: isActive ? 700 : 400,
        })}
      >
        {tab.label}
      </NavLink>
    ))}
  </div>
);

export default AppConfigTabs;
