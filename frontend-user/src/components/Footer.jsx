// src/components/Footer.jsx
//
// Footer del sitio, dentro de AppShell. Fondo en el color primario del admin
// y texto en el acento (igual que la barra superior sólida). A la izquierda:
// logo + nombre de la tienda, correo y teléfono de contacto (StoreConfig) y
// tres columnas de enlaces (mapa del sitio, cuenta, legal); a la derecha, el mismo mapa de puntos de la sección de
// origen, y debajo las redes sociales configuradas (StoreConfig.socialLinks).
// Abajo: © año tienda y el crédito de Duck-Hack.
import React from 'react';
import { Link } from 'react-router-dom';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { useAuth } from '../hooks/useAuth';
import { SITE_LINKS } from '../siteMap';
import StoreImage from './StoreImage';
import OriginMap from './OriginMap';
import { externalHref, telHref } from '../utils/links';
import './Footer.css';

const LEGAL_LINKS = [
  { to: '/privacy-policy', label: 'Aviso de privacidad' },
  { to: '/legal-notice', label: 'Aviso legal' },
];

// Orden y ícono de cada red; solo se muestran las que el admin llenó.
const SOCIAL_NETWORKS = [
  { key: 'instagram', label: 'Instagram', icon: 'fa-instagram' },
  { key: 'facebook', label: 'Facebook', icon: 'fa-facebook-f' },
  { key: 'threads', label: 'Threads', icon: 'fa-threads' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'fa-whatsapp' },
];

// Un WhatsApp escrito solo como número pasa a wa.me; el resto va por
// externalHref (completa https:// y descarta esquemas que no sean http(s)).
const socialHref = (key, value) => {
  const raw = String(value || '').trim();
  if (key === 'whatsapp' && /^[+\d\s()-]+$/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : '';
  }
  return externalHref(raw);
};

const FooterColumn = ({ title, children }) => (
  <nav className="footer-col" aria-label={title}>
    <h2 className="footer-col-title">{title}</h2>
    <ul>{children}</ul>
  </nav>
);

const Footer = () => {
  const { config } = useStoreConfig();
  const { isAuthenticated, logout } = useAuth();
  const storeName = config?.storeName || '';
  const email = (config?.contactEmail || '').trim();
  const phone = (config?.contactPhone || '').trim();
  const phoneHref = telHref(phone);
  const year = new Date().getFullYear();
  const socials = SOCIAL_NETWORKS.map((net) => ({ ...net, href: socialHref(net.key, config?.socialLinks?.[net.key]) })).filter(
    (net) => net.href
  );

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-main">
          <Link to="/" className="footer-brand" aria-label={storeName || 'Inicio'}>
            <StoreImage src={config?.logoUrl} alt={storeName} label="Logo" className="footer-logo" />
            {storeName ? <span className="footer-name">{storeName}</span> : null}
          </Link>

          {email || phoneHref ? (
            <ul className="footer-contact" aria-label="Contacto">
              {email ? (
                <li>
                  <a href={`mailto:${email}`}>
                    <i className="fa-solid fa-envelope" aria-hidden="true" />
                    {email}
                  </a>
                </li>
              ) : null}
              {phoneHref ? (
                <li>
                  <a href={phoneHref}>
                    <i className="fa-solid fa-phone" aria-hidden="true" />
                    {phone}
                  </a>
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="footer-cols">
            <FooterColumn title="Sitio">
              {SITE_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </FooterColumn>

            <FooterColumn title="Tu cuenta">
              {isAuthenticated ? (
                <>
                  <li>
                    <Link to="/mi-cuenta">Mi cuenta</Link>
                  </li>
                  <li>
                    <button type="button" className="footer-link-btn" onClick={logout}>
                      Cerrar sesión
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link to="/login">Iniciar sesión</Link>
                  </li>
                  <li>
                    <Link to="/register">Crear cuenta</Link>
                  </li>
                  <li>
                    <Link to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link>
                  </li>
                </>
              )}
            </FooterColumn>

            <FooterColumn title="Legal">
              {LEGAL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </FooterColumn>
          </div>
        </div>

        <div className="footer-aside">
          <div className="footer-map" aria-hidden="true">
            <OriginMap className="footer-map-svg" variant="standalone" />
          </div>

          {socials.length > 0 ? (
            <ul className="footer-social" aria-label="Redes sociales">
              {socials.map((net) => (
                <li key={net.key}>
                  <a href={net.href} target="_blank" rel="noopener noreferrer" aria-label={net.label} title={net.label}>
                    <i className={`fa-brands ${net.icon}`} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="footer-bottom">
          <span>
            © {year} {storeName}
          </span>
          <a href="https://duck-hack.com" target="_blank" rel="noopener noreferrer">
            Diseñado por Duck-Hack
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
