// src/components/AppShell.js
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';
import Footer from './Footer';
import './AppShell.css';

const NAV_ITEMS = [
  { path: '/', label: 'Inicio' },
  { path: '/servicios', label: 'Servicios' },
  { path: '/precios', label: 'Precios' },
  { path: '/nosotros', label: 'Nosotros' },
  { path: '/clientes', label: 'Clientes' },
  { path: '/contacto', label: 'Contacto' },
];

const ROUTE_LABELS = {
  '/': 'inicio',
  '/servicios': 'servicios',
  '/precios': 'precios',
  '/nosotros': 'nosotros',
  '/clientes': 'clientes',
  '/contacto': 'contacto',
};

const AppShell = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Cierra el drawer móvil automáticamente al cambiar de ruta.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const breadcrumb = ROUTE_LABELS[location.pathname] || location.pathname.replace(/^\//, '');

  return (
    <div className="app-shell">
      <div
        className={`shell-scrim ${drawerOpen ? 'show' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside className={`rail ${drawerOpen ? 'open' : ''}`}>
        <NavLink to="/" className="rail-brand">
          <img src={logo} alt="Duck-Hack" />
          <span>
            duck-hack<span className="rail-brand-accent">/cloud-os</span>
          </span>
        </NavLink>

        <div className="rail-label">{'// navegación'}</div>
        <nav className="rail-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="dot" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="rail-actions">
          <div className="rail-label">{'// redes'}</div>
          <a
            href="https://wa.me/5215661653418?text=Hola,%20estoy%20visitando%20su%20sitio%20web%20y%20me%20gustaría%20obtener%20más%20información%20sobre%20sus%20servicios."
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp
          </a>
          <a href="https://www.instagram.com/duckhack.cloud/" target="_blank" rel="noopener noreferrer">
            <i className="fab fa-instagram" aria-hidden="true" /> Instagram
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=61593021786500"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fab fa-facebook-f" aria-hidden="true" /> Facebook
          </a>
          <a href="https://www.threads.com/@duckhack.cloud" target="_blank" rel="noopener noreferrer">
            <i className="fab fa-threads" aria-hidden="true" /> Threads
          </a>
        </div>

        <div className="rail-foot">
          <div className="status">
            <span className="dot" />
            <a href="https://duck-hack.com/webmail" target="_blank" rel="noopener noreferrer">
              duck-hack.com
            </a>{' '}
            — funcionando
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
              duckhack://<b>{breadcrumb}</b>
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

        <Footer />
      </div>
    </div>
  );
};

export default AppShell;
