// src/components/TopBar.jsx
//
// Barra superior del sitio: logo + nombre de la tienda (StoreConfig), mapa
// del sitio al centro, y a la derecha "Iniciar sesión"/"Mi cuenta" y la cesta
// con su contador. Dos modos (los decide AppShell vía useHero.jsx):
//   - floating: sobre el hero, con 10px de margen y fondo translúcido.
//   - solid: al bajar del hero (o en páginas sin hero), 100% de ancho con el
//     color primario del admin; texto y botones en el color acento.
// En pantallas chicas los enlaces pasan a un menú desplegable.
import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { SITE_LINKS } from '../siteMap';
import StoreImage from './StoreImage';
import './TopBar.css';

const TopBar = ({ mode }) => {
  const { config } = useStoreConfig();
  const { count, openCart } = useCart();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const storeName = config?.storeName || '';
  const account = isAuthenticated
    ? { to: '/mi-cuenta', label: 'Mi cuenta' }
    : { to: '/login', label: 'Iniciar sesión' };

  // El menú se cierra al navegar y con Escape.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const navLinkClass = ({ isActive }) => `topbar-link${isActive ? ' is-active' : ''}`;

  return (
    <header className={`topbar topbar--${mode}${menuOpen ? ' is-menu-open' : ''}`}>
      <div className="topbar-inner">
        <Link to="/" className="topbar-brand" aria-label={storeName || 'Inicio'}>
          <StoreImage src={config?.logoUrl} alt={storeName} label="Logo" className="topbar-logo" />
          {storeName ? <span className="topbar-name">{storeName}</span> : null}
        </Link>

        <nav className="topbar-nav" aria-label="Principal">
          {SITE_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={navLinkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <Link to={account.to} className="topbar-account">
            {account.label}
          </Link>

          <button
            type="button"
            className="topbar-cart"
            aria-label={`Abrir canasta, ${count} ${count === 1 ? 'producto' : 'productos'}`}
            aria-haspopup="dialog"
            onClick={openCart}
          >
            <i className="fas fa-basket-shopping" aria-hidden="true" />
            {count > 0 ? <span className="topbar-cart-badge">{count > 99 ? '99+' : count}</span> : null}
          </button>

          <button
            type="button"
            className="topbar-menu-toggle"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="topbar-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i className={`fas ${menuOpen ? 'fa-xmark' : 'fa-bars'}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <nav id="topbar-menu" className="topbar-menu" aria-label="Principal (móvil)" hidden={!menuOpen}>
        {SITE_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.to === '/'} className={navLinkClass}>
            {link.label}
          </NavLink>
        ))}
        <Link to={account.to} className="topbar-account topbar-menu-account">
          {account.label}
        </Link>
      </nav>
    </header>
  );
};

export default TopBar;
