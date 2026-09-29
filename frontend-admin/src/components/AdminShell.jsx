// Layout persistente del panel admin — mismo patrón de "rail" (sidebar) + topbar
// que frontend-user/src/components/AppShell.js, adaptado a los módulos del admin.
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { ROLES, ROLE_LABELS } from "../utils/roles";
import { MODULE_NAV } from "../utils/permissions";
import { usePermissions } from "../hooks/usePermissions";
import "./AdminShell.css";

const ROUTE_LABELS = {
  "/admin": "panel",
  "/admin/store-config": "store-config",
  "/admin/agency-clients": "clientes",
  "/admin/products": "products",
  "/admin/inventory": "inventory",
  "/admin/orders": "orders",
  "/admin/media": "media",
  "/admin/users": "users",
  "/admin/app-config/home": "app-config/home",
  "/admin/permissions": "permissions",
};

const AdminShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const role = localStorage.getItem("role");
  const name = localStorage.getItem("name");
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;
  // Módulos por tienda (contratados + por rol), ver hooks/usePermissions.jsx.
  const { can } = usePermissions();
  const moduleItems = (key) => (can(key) ? MODULE_NAV.find((module) => module.key === key).items : []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const navItems = [
    // "Panel", "Configurar App" y "Permisos" son siempre solo super_admin.
    ...(isSuperAdmin ? [{ path: "/admin", label: "Panel", end: true }] : []),
    ...moduleItems("storeConfig"),
    ...(isSuperAdmin ? [{ path: "/admin/app-config", label: "Configurar App" }] : []),
    ...MODULE_NAV.filter((module) => module.key !== "storeConfig").flatMap((module) => moduleItems(module.key)),
    ...(isSuperAdmin ? [{ path: "/admin/permissions", label: "Permisos" }] : []),
  ];

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    navigate("/");
    window.location.reload();
  };

  const breadcrumb =
    ROUTE_LABELS[location.pathname] ||
    (location.pathname.startsWith("/admin/agency-clients") ? "clientes" : location.pathname.replace(/^\/admin\/?/, ""));

  return (
    <div className="admin-shell">
      <div
        className={`shell-scrim ${drawerOpen ? "show" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside className={`rail ${drawerOpen ? "open" : ""}`}>
        <NavLink to="/admin" className="rail-brand">
          <img src={logo} alt="Duck-Hack" />
          <span>
            duck-hack<span className="rail-brand-accent">/admin</span>
          </span>
        </NavLink>

        <div className="rail-label">{"// navegación"}</div>
        <nav className="rail-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <span className="dot" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="rail-actions">
          <div className="rail-label">{"// sesión"}</div>
          <button type="button" className="rail-logout" onClick={handleLogout}>
            <i className="fas fa-power-off" aria-hidden="true" /> Cerrar sesión
          </button>
        </div>

        <div className="rail-foot">
          <div className="status">
            <span className="dot" />
            <a href={process.env.REACT_APP_STOREFRONT_URL || "https://mx.duck-hack.cloud"} target="_blank" rel="noopener noreferrer">
              Ver sitio público
            </a>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="menu-btn"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-label="Abrir menú"
              aria-expanded={drawerOpen}
            >
              ☰
            </button>
            <span className="breadcrumb">
              duckhack-admin://<b>{breadcrumb}</b>
            </span>
          </div>
          {name ? (
            <span className="topbar-user">
              whoami: <b>{name}</b> ({ROLE_LABELS[role] || role})
            </span>
          ) : null}
          <div className="chrome-dots">
            <span className="c1" />
            <span className="c2" />
            <span className="c3" />
          </div>
        </div>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminShell;
