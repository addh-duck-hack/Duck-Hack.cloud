// src/ui/Layout.jsx — barra superior, pie y botón de WhatsApp.
import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { activeSorted, useStoreConfig } from '../hooks/useStoreConfig';
import { mediaUrl } from '../utils/format';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const HoursList = ({ hours }) => {
  const list = [...(hours || [])].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7));
  if (!list.length) return null;
  return (
    <ul className="hours">
      {list.map((h) => (
        <li key={h.day}>
          <span>{DAYS[h.day]}</span>
          <span>{h.closed ? 'Cerrado' : `${h.open} – ${h.close}`}</span>
        </li>
      ))}
    </ul>
  );
};

const Header = () => {
  const { config } = useStoreConfig();
  const { isAuthenticated, user } = useAuth();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link to="/" className="brand">
          {config?.logoUrl ? <img src={mediaUrl(config.logoUrl)} alt="" /> : <i className="fa-solid fa-spa" aria-hidden="true" />}
          <span>{config?.storeName || 'Salón'}</span>
        </Link>
        <button type="button" className="menu-btn" aria-expanded={open} aria-label="Menú" onClick={() => setOpen((v) => !v)}>
          <i className={open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars'} aria-hidden="true" />
        </button>
        <nav className={`site-nav ${open ? 'is-open' : ''}`}>
          <NavLink to="/servicios">Servicios</NavLink>
          <NavLink to="/tienda">Tienda</NavLink>
          <NavLink to="/contacto">Contacto</NavLink>
          <NavLink to={isAuthenticated ? '/cuenta' : '/login'}>
            <i className="fa-regular fa-user" aria-hidden="true" /> {isAuthenticated ? user?.name?.split(' ')[0] || 'Mi cuenta' : 'Entrar'}
          </NavLink>
          <NavLink to="/carrito" className="cart-link">
            <i className="fa-solid fa-bag-shopping" aria-hidden="true" /> Carrito
            {count > 0 ? <span className="badge">{count}</span> : null}
          </NavLink>
          <Link to="/agendar" className="btn btn--small">
            Agendar cita
          </Link>
        </nav>
      </div>
    </header>
  );
};

const Footer = () => {
  const { config } = useStoreConfig();
  const social = config?.socialLinks || {};
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__grid">
        <div>
          <h3>{config?.storeName || 'Salón'}</h3>
          {config?.location?.address ? <p>{config.location.address}</p> : null}
          {config?.contactPhone ? <p><i className="fa-solid fa-phone" aria-hidden="true" /> {config.contactPhone}</p> : null}
          {config?.contactEmail ? <p><i className="fa-regular fa-envelope" aria-hidden="true" /> {config.contactEmail}</p> : null}
          <p className="social">
            {social.instagram ? <a href={social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><i className="fa-brands fa-instagram" /></a> : null}
            {social.facebook ? <a href={social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><i className="fa-brands fa-facebook" /></a> : null}
            {social.threads ? <a href={social.threads} target="_blank" rel="noreferrer" aria-label="Threads"><i className="fa-brands fa-threads" /></a> : null}
          </p>
        </div>
        <div>
          <h3>Horario</h3>
          <HoursList hours={config?.businessHours} />
        </div>
        <div>
          <h3>Información</h3>
          <ul className="plain">
            <li><Link to="/servicios">Servicios</Link></li>
            <li><Link to="/tienda">Tienda</Link></li>
            <li><Link to="/legal/privacidad">Aviso de privacidad</Link></li>
            <li><Link to="/legal/aviso">Aviso legal</Link></li>
            <li><Link to="/legal/devoluciones">Cambios y devoluciones</Link></li>
          </ul>
        </div>
      </div>
      <p className="wrap copyright">© {year} {config?.legalIdentity?.legalName || config?.storeName || ''}</p>
    </footer>
  );
};

const WhatsAppButton = () => {
  const { config } = useStoreConfig();
  const wa = config?.whatsappButton;
  if (!wa?.enabled || !wa.phone) return null;
  const href = `https://wa.me/${wa.phone}${wa.defaultMessage ? `?text=${encodeURIComponent(wa.defaultMessage)}` : ''}`;
  return (
    <a className="wa-float" href={href} target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp">
      <i className="fa-brands fa-whatsapp" aria-hidden="true" />
    </a>
  );
};

const Layout = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [pathname]);
  return (
    <>
      <Header />
      <main className="site-main">
        <Outlet />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
};

export const useTeam = () => activeSorted(useStoreConfig().config?.teamMembers);

export default Layout;
