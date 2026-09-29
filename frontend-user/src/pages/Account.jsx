// src/pages/Account.jsx — ruta /mi-cuenta (requiere sesión). Menú lateral
// con las secciones de useAccount (ACCOUNT_SECTIONS) y la sección activa en
// ?seccion= (p. ej. /mi-cuenta?seccion=pedidos desde la confirmación de
// compra). Cada sección vive en components/account/.
import React, { useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../hooks/useAuth';
import { useAccount, ACCOUNT_SECTIONS } from '../hooks/useAccount';
import AccountSummary from '../components/account/AccountSummary';
import AccountOrders from '../components/account/AccountOrders';
import AccountAddresses from '../components/account/AccountAddresses';
import AccountFavorites from '../components/account/AccountFavorites';
import AccountProfile from '../components/account/AccountProfile';
import AccountSecurity from '../components/account/AccountSecurity';
import FeaturedProducts from '../components/FeaturedProducts';
import './Account.css';

const SECTION_COMPONENTS = {
  resumen: AccountSummary,
  pedidos: AccountOrders,
  direcciones: AccountAddresses,
  favoritos: AccountFavorites,
  datos: AccountProfile,
  seguridad: AccountSecurity,
};

const AccountContent = ({ leave }) => {
  const account = useAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('seccion');
  const section = SECTION_COMPONENTS[requested] ? requested : 'resumen';
  const Section = SECTION_COMPONENTS[section];

  // Cambiar de sección (el detalle de un pedido abierto se conserva solo si
  // se va a "Mis pedidos" desde el resumen; el menú siempre muestra la lista).
  const go = (id) => {
    setSearchParams(id === 'resumen' ? {} : { seccion: id });
    window.scrollTo(0, 0);
  };

  const onNav = (id) => {
    account.orders.close();
    go(id);
  };

  const logout = () => leave(account.logout);

  const counts = {
    pedidos: account.orders.pendingCount,
    direcciones: account.addresses.list.length,
    favoritos: account.favorites.list.length,
  };
  const firstName = String(account.profile.data?.name || account.user?.name || '').split(' ')[0];

  return (
    <div className="acc">
      <header className="acc-head">
        <h1 className="acc-title">
          Hola{firstName ? ',' : ''} <em>{firstName || 'de nuevo'}</em>
        </h1>
        <p className="acc-muted">Aquí están tus pedidos, direcciones y datos de tu cuenta.</p>
      </header>

      {account.profile.loadError ? (
        <p className="acc-alert acc-alert--error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{account.profile.loadError}</span>
        </p>
      ) : null}

      <div className="acc-layout">
        <nav className="acc-nav" aria-label="Secciones de tu cuenta">
          <ul>
            {ACCOUNT_SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`acc-nav-item${section === item.id ? ' is-active' : ''}`}
                  aria-current={section === item.id ? 'page' : undefined}
                  onClick={() => onNav(item.id)}
                >
                  <i className={item.icon} aria-hidden="true" />
                  <span>{item.label}</span>
                  {counts[item.id] ? <em className="acc-nav-count">{counts[item.id]}</em> : null}
                </button>
              </li>
            ))}
            <li className="acc-nav-sep">
              <button type="button" className="acc-nav-item" onClick={logout}>
                <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
                <span>Cerrar sesión</span>
              </button>
            </li>
          </ul>
        </nav>

        <div className="acc-main">
          {account.profile.isLoading && !account.profile.data ? (
            <p className="acc-muted">Cargando tu cuenta…</p>
          ) : (
            <Section account={account} go={go} leave={leave} />
          )}
        </div>
      </div>

      {/* Cierre de la página en lugar del CtaBanner (ver AppShell). */}
      <FeaturedProducts title="Recomendados para ti" className="acc-recommended" />
    </div>
  );
};

const Account = () => {
  usePageMeta('Mi cuenta');
  const { isAuthenticated } = useAuth();
  // Cerrar sesión o eliminar la cuenta desde aquí lleva al inicio; entrar sin
  // sesión, al login (y de regreso aquí al iniciar sesión).
  const leftRef = useRef(false);
  const leave = (closeSession) => {
    leftRef.current = true;
    closeSession();
  };

  if (!isAuthenticated) return <Navigate to={leftRef.current ? '/' : '/login?next=%2Fmi-cuenta'} replace />;
  return <AccountContent leave={leave} />;
};

export default Account;
