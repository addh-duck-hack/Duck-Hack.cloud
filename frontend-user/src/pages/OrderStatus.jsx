// src/pages/OrderStatus.jsx — ruta /pedido/:id: la página del pedido a la que
// lleva el correo de confirmación ("Subir mi comprobante") y la confirmación
// del checkout. Funciona sin cuenta, con el token del pedido (?token=… en el
// enlace; ver hooks/useOrderAccess.js#useOrderPage), o con la sesión del
// dueño. Muestra el estado, los datos para transferir mientras se espera el
// pago, los comprobantes y el formulario para subir uno, y el ticket.
// Contrato con el backend: packages/core-api/modules/orders.js#GET /:id/summary.
import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useOrderPage } from '../hooks/useOrderAccess';
import { formatMxn } from '../hooks/useCart';
import { formatDate, orderStatusLabel, orderStatusSequence } from '../hooks/useAccount';
import { formatOrderFolio, mapsHref } from '../hooks/useCheckout';
import PaymentProofPanel from '../components/PaymentProofPanel';
import './Account.css';
import './OrderStatus.css';

const Alert = ({ type, children }) => (
  <p className={`acc-alert acc-alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
    <i className={type === 'error' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-info'} aria-hidden="true" />
    <span>{children}</span>
  </p>
);

const StatusTimeline = ({ order }) => {
  if (order.status === 'cancelled') return <Alert type="error">Este pedido fue cancelado.</Alert>;
  const sequence = orderStatusSequence(order);
  const current = sequence.indexOf(order.status);
  return (
    <ol className="acc-timeline" aria-label="Estado del pedido">
      {sequence.map((status, i) => (
        <li key={status} className={i < current ? 'is-done' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="acc-timeline-dot" aria-hidden="true">
            {i <= current ? <i className="fa-solid fa-check" /> : null}
          </span>
          <span>{orderStatusLabel(status, order.deliveryMethod)}</span>
        </li>
      ))}
    </ol>
  );
};

// Dato de la cuenta con botón de copiar (la CLABE se teclea mal fácil).
const CopyRow = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permiso de portapapeles: el dato sigue a la vista para copiarlo a mano.
    }
  };
  return (
    <div className="op-account-row">
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        <button type="button" className="acc-link" onClick={copy} aria-label={`Copiar ${label}`}>
          <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} aria-hidden="true" /> {copied ? 'Copiado' : 'Copiar'}
        </button>
      </dd>
    </div>
  );
};

const OrderStatus = () => {
  const { id } = useParams();
  const page = useOrderPage(id);
  const { summary, isLoading, error, proof, ticket } = page;
  const order = summary?.order;
  usePageMeta(order ? `Pedido ${formatOrderFolio(order.orderNumber)}` : 'Tu pedido');

  if (isLoading) {
    return (
      <section className="op">
        <p className="acc-muted">Cargando tu pedido…</p>
      </section>
    );
  }

  if (error || !order) {
    return (
      <section className="op">
        <div className="acc-card op-empty">
          <i className="fa-solid fa-box-open" aria-hidden="true" />
          <h1>No pudimos abrir tu pedido</h1>
          <p className="acc-muted">{error?.message || 'No encontramos este pedido.'}</p>
          <div className="acc-actions">
            {error?.expired ? (
              <Link to="/login" className="acc-btn">
                Iniciar sesión
              </Link>
            ) : null}
            <Link to="/contacto" className="acc-btn acc-btn--ghost">
              Contáctanos
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const { payment, paymentProofs, canUploadProof } = summary;
  const point = order.deliveryMethod === 'pickup' ? order.pickupPoint : null;
  const a = order.shippingAddress;
  const href = mapsHref(point);
  const firstName = String(order.customerName || '').split(' ')[0];

  return (
    <section className="op" aria-labelledby="op-title">
      <div className="acc-section">
        <div className="acc-card">
          <div className="acc-card-head">
            <h1 id="op-title">
              {firstName ? `Hola ${firstName}, ` : ''}tu pedido {formatOrderFolio(order.orderNumber)}
              <small>Hecho el {formatDate(order.createdAt)}</small>
            </h1>
            <span className={`acc-status is-${order.status}`}>{orderStatusLabel(order.status, order.deliveryMethod)}</span>
          </div>
          <StatusTimeline order={order} />
        </div>

        {payment.type === 'spei' ? (
          <div className="acc-card">
            <h2 className="acc-card-title">
              <i className="fa-solid fa-building-columns" aria-hidden="true" /> Pago por transferencia
            </h2>
            {payment.spei ? (
              <>
                <p className="acc-muted">
                  Transfiere <strong>{formatMxn(order.total)}</strong> a esta cuenta y después sube tu comprobante aquí abajo.
                </p>
                <dl className="op-account">
                  {payment.spei.accountHolderName ? <CopyRow label="Beneficiario" value={payment.spei.accountHolderName} /> : null}
                  {payment.spei.bank ? (
                    <div className="op-account-row">
                      <dt>Banco</dt>
                      <dd>
                        <span>{payment.spei.bank}</span>
                      </dd>
                    </div>
                  ) : null}
                  <CopyRow label="CLABE" value={payment.spei.clabe} />
                  {payment.spei.phone ? <CopyRow label="Celular" value={payment.spei.phone} /> : null}
                  <CopyRow label="Monto" value={String(order.total)} />
                </dl>
              </>
            ) : null}
            <PaymentProofPanel proofs={paymentProofs} canUpload={canUploadProof} uploader={proof} />
            {!canUploadProof && !payment.spei && paymentProofs.length === 0 ? (
              <p className="acc-muted">Tu pago ya quedó registrado.</p>
            ) : null}
          </div>
        ) : payment.instructions && ['pending', 'payment_review'].includes(order.status) ? (
          <div className="acc-card">
            <h2 className="acc-card-title">
              <i className="fa-solid fa-wallet" aria-hidden="true" /> {order.paymentMethodLabel || 'Pago'}
            </h2>
            <p className="acc-muted">{payment.instructions}</p>
          </div>
        ) : null}

        <div className="acc-grid-2">
          <div className="acc-card">
            <h2 className="acc-card-title">
              <i className={point ? 'fa-solid fa-store' : 'fa-solid fa-truck-fast'} aria-hidden="true" />{' '}
              {point ? 'Recoger en punto de venta' : 'Envío a domicilio'}
            </h2>
            {point ? (
              <p className="acc-lines">
                <strong>{point.name}</strong>
                {point.address ? <span>{point.address}</span> : null}
                {point.schedule ? <span>Horario: {point.schedule}</span> : null}
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="acc-link">
                    Ver en el mapa
                  </a>
                ) : null}
              </p>
            ) : a?.street ? (
              <p className="acc-lines">
                <strong>{a.recipientName}</strong>
                <span>
                  {a.street} {a.exteriorNumber}
                  {a.interiorNumber ? `, int. ${a.interiorNumber}` : ''}, {a.neighborhood}
                </span>
                <span>
                  {a.city}, {a.state} · C.P. {a.zipCode}
                </span>
              </p>
            ) : (
              <p className="acc-muted">Te contactamos para coordinar la entrega.</p>
            )}
            {order.shipment?.trackingNumber ? (
              <p className="acc-lines">
                <span>
                  {order.shipment.carrier ? `${order.shipment.carrier} · ` : ''}Guía {order.shipment.trackingNumber}
                </span>
                {order.shipment.trackingUrl ? (
                  <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer" className="acc-link">
                    Rastrear mi pedido
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="acc-card">
            <h2 className="acc-card-title">Productos</h2>
            <ul className="acc-items">
              {order.items.map((item, i) => (
                <li key={`${i}-${item.productName}`}>
                  <span>
                    {item.productName} <small>×{item.quantity}</small>
                    {item.variantLabel ? <small className="op-variant">{item.variantLabel}</small> : null}
                  </span>
                  <span className="acc-items-price">{formatMxn(item.subtotal)}</span>
                </li>
              ))}
              {order.discount?.amount ? (
                <li className="acc-items-discount">
                  <span>Cupón {order.discount.code}</span>
                  <span>−{formatMxn(order.discount.amount)}</span>
                </li>
              ) : null}
              <li>
                <span>Envío</span>
                <span>{order.shippingCost ? formatMxn(order.shippingCost) : 'Gratis'}</span>
              </li>
              <li className="acc-items-total">
                <span>Total</span>
                <span>{formatMxn(order.total)}</span>
              </li>
            </ul>
          </div>
        </div>

        {ticket.error ? <Alert type="error">{ticket.error}</Alert> : null}
        <div className="acc-actions">
          <button type="button" className="acc-btn acc-btn--ghost" onClick={() => ticket.download(order._id)} disabled={ticket.isDownloading}>
            <i className="fa-regular fa-file-pdf" aria-hidden="true" /> {ticket.isDownloading ? 'Abriendo…' : 'Descarga tu ticket'}
          </button>
          <Link to="/tienda" className="acc-btn">
            Seguir comprando
          </Link>
        </div>
      </div>
    </section>
  );
};

export default OrderStatus;
