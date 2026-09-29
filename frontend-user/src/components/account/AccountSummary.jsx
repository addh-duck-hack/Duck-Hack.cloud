// src/components/account/AccountSummary.jsx — sección "Resumen" de Mi cuenta:
// accesos con contadores y el pedido más reciente.
import React from 'react';
import { Link } from 'react-router-dom';
import { formatMxn } from '../../hooks/useCart';
import { formatDate, isOrderActive, orderStatusLabel } from '../../hooks/useAccount';
import { formatOrderFolio } from '../../hooks/useCheckout';

const AccountSummary = ({ account, go }) => {
  const { orders, addresses, favorites } = account;
  const lastOrder = orders.list[0];

  const tiles = [
    { section: 'pedidos', icon: 'fa-solid fa-box', value: orders.pendingCount, label: orders.pendingCount === 1 ? 'Pedido en curso' : 'Pedidos en curso' },
    { section: 'direcciones', icon: 'fa-solid fa-location-dot', value: addresses.list.length, label: 'Direcciones guardadas' },
    { section: 'favoritos', icon: 'fa-regular fa-heart', value: favorites.list.length, label: 'En tu lista de deseos' },
  ];

  return (
    <div className="acc-section">
      <div className="acc-tiles">
        {tiles.map((tile) => (
          <button key={tile.section} type="button" className="acc-tile" onClick={() => go(tile.section)}>
            <span className="acc-tile-icon" aria-hidden="true">
              <i className={tile.icon} />
            </span>
            <strong>{orders.isLoading && tile.section === 'pedidos' ? '…' : tile.value}</strong>
            <span>{tile.label}</span>
          </button>
        ))}
      </div>

      <div className="acc-card">
        <div className="acc-card-head">
          <h2>Tu pedido más reciente</h2>
          {orders.list.length > 1 ? (
            <button type="button" className="acc-link" onClick={() => go('pedidos')}>
              Ver todos
            </button>
          ) : null}
        </div>
        {orders.isLoading ? <p className="acc-muted">Cargando tus pedidos…</p> : null}
        {!orders.isLoading && !lastOrder ? (
          <div className="acc-empty">
            <i className="fa-solid fa-mug-hot" aria-hidden="true" />
            <p>Todavía no tienes pedidos. ¿Qué tal un café de altura?</p>
            <Link to="/tienda" className="acc-btn">
              Ir a la tienda
            </Link>
          </div>
        ) : null}
        {lastOrder ? (
          <button
            type="button"
            className="acc-order-row"
            onClick={() => {
              orders.open(lastOrder._id);
              go('pedidos');
            }}
          >
            <span className="acc-order-main">
              <strong>{formatOrderFolio(lastOrder.orderNumber)}</strong>
              <span>
                {formatDate(lastOrder.createdAt)} · {lastOrder.items?.length || 0} producto{lastOrder.items?.length === 1 ? '' : 's'}
              </span>
            </span>
            <span className={`acc-status is-${lastOrder.status}`}>{orderStatusLabel(lastOrder.status, lastOrder.deliveryMethod)}</span>
            <span className="acc-order-total">{formatMxn(lastOrder.total)}</span>
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </button>
        ) : null}
        {lastOrder && isOrderActive(lastOrder) ? (
          <p className="acc-muted acc-hint">Te avisaremos por correo cuando cambie el estado de tu pedido.</p>
        ) : null}
      </div>
    </div>
  );
};

export default AccountSummary;
