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
  "/admin/products": "products",
  "/admin/inventory": "inventory",
  "/admin/orders": "orders",
};

const AdminShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const role = localStorage.getItem("role");
  const canManageStoreConfig = ["super_admin", "store_admin"].includes(role);
  const canManageCatalog = ["super_admin", "store_admin", "catalog_manager"].includes(role);
  const canManageOrders = ["super_admin", "store_admin", "order_manager"].includes(role);
  const isSuperAdmin = role === "super_admin";

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const navItems = [
    { path: "/admin", label: "Panel", end: true },
    ...(canManageStoreConfig ? [{ path: "/admin/store-config", label: "Configurar tienda" }] : []),
    ...(canManageCatalog
      ? [
          { path: "/admin/products", label: "Productos" },
          { path: "/admin/inventory", label: "Inventario" },
        ]
      : []),
    ...(canManageOrders ? [{ path: "/admin/orders", label: "Pedidos" }] : []),
    ...(isSuperAdmin
      ? [
          { path: "/admin/agency-clients", label: "Clientes de agencia" },
          { path: "/admin/accounting", label: "Contabilidad" },
          { path: "/admin/accounting/transactions", label: "Movimientos" },
          { path: "/admin/invoices", label: "Facturación" },
        ]
      : []),
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
