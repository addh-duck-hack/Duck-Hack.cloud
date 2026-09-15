// src/components/AppShell.jsx
//
// PROPUESTA B · "De Sutu Cha'Nu": navegación superior horizontal (antes riel
// lateral tipo cloud-os). Wordmark = sello + "Café" en script sobre "TACITA".
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Footer from './Footer';
import BrandMarks, { BrandSeal } from './BrandMarks';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import './AppShell.css';

const NAV_ITEMS = [
  { path: '/', label: 'Inicio', end: true },
  { path: '/tienda', label: 'Tienda' },
  { path: '/servicios', label: 'El proceso' },
  { path: '/nosotros', label: 'Nuestra raíz' },
  { path: '/clientes', label: 'Cafeterías' },
  { path: '/contacto', label: 'Contacto' },
];

const AppShell = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { config } = useStoreConfig();
  const { count } = useCart();
  const { isAuthenticated } = useAuth();

  // "Mi cuenta" no es un item fijo de NAV_ITEMS porque su destino cambia con
  // la sesión: con sesión va directo a la cuenta, sin sesión al login.
  const navItems = [...NAV_ITEMS, { path: isAuthenticated ? '/mi-cuenta' : '/login', label: 'Mi cuenta' }];

  // Cierra el drawer móvil automáticamente al cambiar de ruta.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const customLogo = resolveStoreImageUrl(config?.logoUrl);
  const brandName = config?.storeName || 'Café Tacita';

  return (
    <div className="app-shell">
      <BrandMarks />

      <div
        className={`shell-scrim ${drawerOpen ? 'show' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <nav className="topnav">
        <div className="topnav-inner">
          <NavLink to="/" className="wordmark" aria-label={`${brandName} — inicio`}>
            {customLogo ? (
              <img
                className="wordmark-logo"
                src={customLogo}
                alt={brandName}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <BrandSeal />
            )}
            <span className="wm-text">
              <span className="wm-script">Café</span>
              <span className="wm-name">Tacita</span>
            </span>
          </NavLink>

          <button
            className="burger"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-label="Abrir menú"
            aria-expanded={drawerOpen}
          >
            ☰
          </button>

          <div className={`nav-links ${drawerOpen ? 'open' : ''}`}>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <button
            className="nav-cart"
            onClick={() => navigate('/carrito')}
            data-n={count}
          >
            Canasta
          </button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
};

export default AppShell;
