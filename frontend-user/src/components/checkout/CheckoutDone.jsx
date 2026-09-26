// src/components/checkout/CheckoutDone.jsx — confirmación: folio, cómo pagar
// (según el tipo de método) y la entrega, con lo que regresó la API.
import React from 'react';
import { Link } from 'react-router-dom';
import { formatMxn } from '../../hooks/useCart';
import { mapsHref } from '../../hooks/useCheckout';

const CheckoutDone = ({ co }) => {
  const { order, orderFolio, auth } = co;
  const firstName = String(order.customerName || '').split(' ')[0];
  const point = order.deliveryMethod === 'pickup' ? order.pickupPoint : null;
  const a = order.shippingAddress;
  const href = mapsHref(point);

  return (
    <section className="co-done" aria-labelledby="co-done-title">
      <span className="co-done-icon" aria-hidden="true">
        <i className="fa-solid fa-check" />
      </span>
      <h1 id="co-done-title">¡Gracias por tu pedido{firstName ? `, ${firstName}` : ''}!</h1>
      <p className="co-done-folio">
        Pedido <strong>{orderFolio}</strong>
      </p>
      <p className="co-muted">
        Te enviamos la confirmación a <strong>{order.customerEmail}</strong>.
      </p>

      <div className="co-done-grid">
        <div className="co-done-card">
          <h2>
            <i className="fa-solid fa-wallet" aria-hidden="true" /> Cómo pagar
          </h2>
          <p>
            <strong>{order.paymentMethodLabel}</strong>
          </p>
          {order.paymentMethodType === 'spei' ? (
            <p>
              Te enviamos por correo los datos para tu transferencia por <strong>{formatMxn(order.total)}</strong>. Tu pedido
              queda apartado mientras confirmamos el pago.
            </p>
          ) : (
            <p>{order.paymentInstructions || 'Te contactaremos para coordinar el pago de tu pedido.'}</p>
          )}
        </div>

        <div className="co-done-card">
          <h2>
            <i className={point ? 'fa-solid fa-store' : 'fa-solid fa-truck-fast'} aria-hidden="true" />{' '}
            {point ? 'Dónde recoger' : 'Envío a domicilio'}
          </h2>
          {point ? (
            <p>
              <strong>{point.name}</strong>
              {point.address ? <span>{point.address}</span> : null}
              {point.schedule ? <span>Horario: {point.schedule}</span> : null}
              {point.instructions ? <span>{point.instructions}</span> : null}
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="co-link">
                  Ver en el mapa
                </a>
              ) : null}
            </p>
          ) : a ? (
            <p>
              <span>
                {a.street} {a.exteriorNumber}
                {a.interiorNumber ? `, int. ${a.interiorNumber}` : ''}, {a.neighborhood}
              </span>
              <span>
                {a.city}, {a.state} · C.P. {a.zipCode}
              </span>
              <span>Recibe: {a.recipientName}</span>
            </p>
          ) : (
            <p>Te escribimos para coordinar la entrega.</p>
          )}
        </div>
      </div>

      <div className="co-done-card co-done-items">
        <h2>Tu pedido</h2>
        <ul>
          {(order.items || []).map((item, i) => (
            <li key={`${i}-${item.productName}`}>
              <span>
                {item.productName} <small>×{item.quantity}</small>
              </span>
              <span>{formatMxn(item.subtotal)}</span>
            </li>
          ))}
          <li>
            <span>Envío</span>
            <span>{order.shippingCost ? formatMxn(order.shippingCost) : 'Gratis'}</span>
          </li>
          <li className="co-done-total">
            <span>Total</span>
            <span>{formatMxn(order.total)}</span>
          </li>
        </ul>
      </div>

      <div className="co-actions co-done-actions">
        <Link to="/tienda" className="co-btn co-btn--solid">
          Seguir comprando
        </Link>
        {auth.isAuthenticated ? (
          <Link to="/mi-cuenta" className="co-btn">
            Ver mis pedidos
          </Link>
        ) : null}
      </div>
    </section>
  );
};

export default CheckoutDone;
