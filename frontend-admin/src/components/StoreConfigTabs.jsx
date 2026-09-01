import React from "react";
import { NavLink } from "react-router-dom";

const TABS = [
  { path: "/admin/store-config", label: "General", end: true },
  { path: "/admin/store-config/home", label: "Home" },
  { path: "/admin/store-config/servicios-precios", label: "Servicios y precios" },
  { path: "/admin/store-config/equipo-testimonios", label: "Equipo y testimonios" },
  { path: "/admin/store-config/legal", label: "Identidad legal" },
];

// Sub-navegación de las 5 pantallas de configuración de tienda. Se muestra
// arriba de cada una en vez de saturar el sidebar principal con 5 entradas.
const StoreConfigTabs = () => (
  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem", borderBottom: "1px solid var(--input-border-color)", paddingBottom: "0.75rem" }}>
    {TABS.map((tab) => (
      <NavLink
        key={tab.path}
        to={tab.path}
        end={tab.end}
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

export default StoreConfigTabs;
