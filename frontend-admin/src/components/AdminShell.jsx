// Layout persistente del panel admin — mismo patrón de "rail" (sidebar) + topbar
// que frontend-user/src/components/AppShell.js, adaptado a los módulos del admin.
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { ROLES, ROLE_LABELS } from "../utils/roles";
import { navGroupsFor } from "../utils/permissions";
import { usePermissions } from "../hooks/usePermissions";
import { useStoreConfig } from "../hooks/useStoreConfig";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import "./AdminShell.css";

// Ruta guardada por el backend (uploads/…) → URL absoluta.
const mediaUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${getApiBaseUrl()}/${path.replace(/^\/+/, "")}`;
};

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

// ¿La ruta actual cae en esta entrada del menú? (mismo criterio que NavLink).
const matchesItem = (item, pathname) =>
  item.end ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`);

const NavItem = ({ item }) => (
  <NavLink to={item.path} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
    <span className="dot" />
    {item.label}
  </NavLink>
);

// Grupos abiertos/cerrados: se recuerdan por navegador; el del módulo actual
// siempre se abre.
const OPEN_GROUPS_KEY = "admin.navOpenGroups";
const readOpenGroups = () => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY)) || {};
  } catch {
    return {};
  }
};

const AdminShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { config: storeConfig } = useStoreConfig();
  const storeName = storeConfig?.storeName || "";
  const storeLogo = mediaUrl(storeConfig?.logoUrl);
  const role = localStorage.getItem("role");
  const name = localStorage.getItem("name");
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;
  // Módulos por tienda (contratados + por rol), ver hooks/usePermissions.jsx.
  const { can } = usePermissions();
  const navGroups = navGroupsFor(can, isSuperAdmin, role);
  const [openGroups, setOpenGroups] = useState(readOpenGroups);
  const activeGroupId = navGroups.find((group) => group.items.some((item) => matchesItem(item, location.pathname)))?.id;

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (activeGroupId) setOpenGroups((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
  }, [activeGroupId]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(openGroups));
    } catch {
      // sin almacenamiento: el menú funciona igual, solo no se recuerda
    }
  }, [openGroups]);

  const toggleGroup = (id) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  // Un grupo del menú: enlaces sueltos (sin título o con una sola entrada
  // visible) o sección plegable.
  const renderGroup = (group) => {
    // Sin título, o con una sola entrada visible: enlaces sueltos.
    if (!group.label || group.items.length === 1) {
      return group.items.map((item) => <NavItem key={item.path} item={item} />);
    }
    const isOpen = Boolean(openGroups[group.id]);
    const isActive = group.id === activeGroupId;
    return (
      <div key={group.id} className={`rail-group${isOpen ? " open" : ""}${isActive ? " has-active" : ""}`}>
        <button
          type="button"
          className="rail-group-toggle"
          onClick={() => toggleGroup(group.id)}
          aria-expanded={isOpen}
          aria-controls={`rail-group-${group.id}`}
        >
          <i className={`${group.icon} rail-group-icon`} aria-hidden="true" />
          <span>{group.label}</span>
          <i className="fa-solid fa-chevron-down rail-group-chevron" aria-hidden="true" />
        </button>
        {isOpen ? (
          <div id={`rail-group-${group.id}`} className="rail-group-items">
            {group.items.map((item) => (
              <NavItem key={item.path} item={item} />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const topGroups = navGroups.filter((group) => !group.bottom);
  const bottomGroups = navGroups.filter((group) => group.bottom);

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
        {/* Marca de la tienda (Configurar tienda → nombre y logo); el panel es
            "Duck-Hack OS", la plataforma, y lo dice debajo. */}
        <NavLink to="/admin" className="rail-brand">
          <img src={storeLogo || logo} alt="" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = logo; }} />
          <span className="rail-brand-text">
            <span className="rail-brand-name">{storeName || "Duck-Hack OS"}</span>
            {storeName ? <small className="rail-brand-accent">Duck-Hack OS</small> : null}
          </span>
        </NavLink>

        <div className="rail-label">{"// navegación"}</div>
        <nav className="rail-nav">{topGroups.map(renderGroup)}</nav>

        <div className="rail-actions">
          <div className="rail-label">{"// sesión"}</div>
          {bottomGroups.length ? <div className="rail-nav rail-nav--bottom">{bottomGroups.map(renderGroup)}</div> : null}
          <button type="button" className="rail-logout" onClick={handleLogout}>
            <i className="fas fa-power-off" aria-hidden="true" /> Cerrar sesión
          </button>
        </div>

        <div className="rail-foot">
          {process.env.REACT_APP_STOREFRONT_URL ? (
            <div className="status">
              <span className="dot" />
              <a href={process.env.REACT_APP_STOREFRONT_URL} target="_blank" rel="noopener noreferrer">
                Ver sitio público
              </a>
            </div>
          ) : null}
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
              <b>{breadcrumb}</b>
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
