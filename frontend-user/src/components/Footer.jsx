// src/components/Footer.jsx
//
// Footer del sitio, dentro de AppShell. Fondo en el color primario del admin
// y texto en el acento (igual que la barra superior sólida). A la izquierda:
// logo + nombre de la tienda y tres columnas de enlaces (mapa del sitio,
// cuenta, legal); a la derecha, el mismo mapa de puntos de la sección de
// origen. Abajo: © año tienda y el crédito de Duck-Hack.
import React from 'react';
import { Link } from 'react-router-dom';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { useAuth } from '../hooks/useAuth';
import { SITE_LINKS } from '../siteMap';
import StoreImage from './StoreImage';
import OriginMap from './OriginMap';
import './Footer.css';

const LEGAL_LINKS = [
  { to: '/privacy-policy', label: 'Aviso de privacidad' },
  { to: '/legal-notice', label: 'Aviso legal' },
];

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
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-main">
          <Link to="/" className="footer-brand" aria-label={storeName || 'Inicio'}>
            <StoreImage src={config?.logoUrl} alt={storeName} label="Logo" className="footer-logo" />
            {storeName ? <span className="footer-name">{storeName}</span> : null}
          </Link>

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

        <div className="footer-map" aria-hidden="true">
          <OriginMap className="footer-map-svg" variant="standalone" />
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
