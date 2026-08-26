// Layout persistente del panel admin — mismo patrón de "rail" (sidebar) + topbar
// que frontend-user/src/components/AppShell.js, adaptado a los módulos del admin.
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import "./AdminShell.css";

const ROUTE_LABELS = {
  "/admin": "panel",
  "/admin/store-config": "store-config",
  "/admin/agency-clients": "agency-clients",
};

// Herramientas de infraestructura del servidor — confidencial, solo super_admin
// (mismo criterio que "Clientes de agencia": no son datos ni accesos que un
// store_admin de un cliente deba ver).
const INFRA_TOOLS = [
  { label: "Portainer", url: "https://portainer.server.duck-hack.cloud", icon: "fa-brands fa-docker" },
  { label: "NGINX Proxy Manager", url: "https://npm.server.duck-hack.cloud", icon: "fas fa-network-wired" },
  { label: "Panel de deploy", url: "https://deploy.server.duck-hack.cloud", icon: "fas fa-rocket" },
  { label: "Servidor FTP", url: "https://ftp.server.duck-hack.cloud", icon: "fas fa-folder-open" },
  { label: "MongoDB", url: "https://mongo.duck-hack.cloud", icon: "fas fa-database" },
  { label: "PHP My Admin", url: "https://pma.server.duck-hack.cloud", icon: "fa-brands fa-php" },
];

const AdminShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const role = localStorage.getItem("role");
  const canManageStoreConfig = ["super_admin", "store_admin"].includes(role);
  const isSuperAdmin = role === "super_admin";

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const navItems = [
    { path: "/admin", label: "Panel", end: true },
    ...(canManageStoreConfig ? [{ path: "/admin/store-config", label: "Configurar tienda" }] : []),
    ...(isSuperAdmin ? [{ path: "/admin/agency-clients", label: "Clientes de agencia" }] : []),
  ];

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
    window.location.reload();
  };

  const breadcrumb =
    ROUTE_LABELS[location.pathname] ||
    (location.pathname.startsWith("/admin/agency-clients") ? "agency-clients" : location.pathname.replace(/^\/admin\/?/, ""));

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

        {isSuperAdmin ? (
          <div className="rail-actions">
            <div className="rail-label">{"// infraestructura"}</div>
            {INFRA_TOOLS.map((tool) => (
              <a key={tool.url} href={tool.url} target="_blank" rel="noopener noreferrer">
                <i className={tool.icon} aria-hidden="true" /> {tool.label}
              </a>
            ))}
          </div>
        ) : null}

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
