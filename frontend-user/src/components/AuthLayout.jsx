// src/components/AuthLayout.jsx
//
// Marco de las páginas de cuenta (/login, /register, /recuperar-contrasena):
// a la izquierda un panel de marca con el nombre de la tienda y los
// beneficios de tener cuenta; a la derecha la tarjeta con el formulario
// (`children`). En móvil el panel se reduce a una franja arriba.
import React from 'react';
import { useStoreConfig } from '../hooks/useStoreConfig';
import StoreImage from './StoreImage';
import './AuthLayout.css';

const BENEFITS = [
  { icon: 'fa-solid fa-bolt', text: 'Compra más rápido con tus datos guardados' },
  { icon: 'fa-solid fa-location-dot', text: 'Guarda tus direcciones de entrega' },
  { icon: 'fa-solid fa-box', text: 'Sigue tus pedidos y vuelve a pedir tu café favorito' },
  { icon: 'fa-regular fa-heart', text: 'Arma tu lista de deseos' },
];

export const PasswordInput = ({ id, visible, onToggle, ...props }) => (
  <span className="auth-password">
    <input id={id} type={visible ? 'text' : 'password'} {...props} />
    <button type="button" onClick={onToggle} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-controls={id}>
      <i className={visible ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} aria-hidden="true" />
    </button>
  </span>
);

const AuthLayout = ({ eyebrow, title, highlight, children }) => {
  const { config } = useStoreConfig();
  const storeName = (config?.storeName || '').trim();

  return (
    <section className="auth">
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-brand-head">
          <StoreImage src={config?.logoUrl} alt="" label="Logo" className="auth-logo" />
          {storeName ? <span>{storeName}</span> : null}
        </div>
        <p className="auth-brand-title">
          Tu café de altura, <em>a un clic</em>
        </p>
        <ul className="auth-benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit.text}>
              <i className={benefit.icon} />
              <span>{benefit.text}</span>
            </li>
          ))}
        </ul>
      </aside>

      <div className="auth-panel">
        <div className="auth-card">
          {eyebrow ? <p className="auth-eyebrow">{eyebrow}</p> : null}
          <h1 className="auth-title">
            {title} {highlight ? <em>{highlight}</em> : null}
          </h1>
          {children}
        </div>
      </div>
    </section>
  );
};

export default AuthLayout;
