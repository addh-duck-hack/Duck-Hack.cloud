// src/components/account/AccountOrders.jsx — "Mis pedidos": lista y detalle
// (estado en línea de tiempo, productos, envío, entrega, pago con el
// comprobante de transferencia, comprar de nuevo y ticket PDF).
import React from 'react';
import { Link } from 'react-router-dom';
import { formatMxn } from '../../hooks/useCart';
import { formatDate, orderStatusLabel, orderStatusSequence, isAwaitingPayment } from '../../hooks/useAccount';
import { formatOrderFolio, mapsHref } from '../../hooks/useCheckout';
import { usePaymentProofUpload } from '../../hooks/useOrderAccess';
import { useStoreConfig } from '../../hooks/useStoreConfig';
import PaymentProofPanel from '../PaymentProofPanel';

const LEGACY_PAYMENT_LABELS = { transfer: 'Transferencia / SPEI', pickup: 'Pago al recoger' };

const Alert = ({ type, children }) =>
  children ? (
    <p className={`acc-alert acc-alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <i className={type === 'error' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check'} aria-hidden="true" />
      <span>{children}</span>
    </p>
  ) : null;

const StatusTimeline = ({ order }) => {
  if (order.status === 'cancelled') {
    return (
      <p className="acc-alert acc-alert--error">
        <i className="fa-solid fa-ban" aria-hidden="true" />
        <span>Este pedido fue cancelado.</span>
      </p>
    );
  }
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

const OrderDetail = ({ orders }) => {
  const order = orders.selected;
  const { config } = useStoreConfig();
  const uploader = usePaymentProofUpload({ orderId: order._id, getHeaders: orders.authHeader, onUploaded: orders.reload });
  // Comprobante: solo pagos por transferencia. Se puede subir si la tienda lo
  // activó (StoreConfig.customerProofUpload) y el pedido espera su pago; los
  // que ya se mandaron se muestran siempre.
  const isSpei = order.paymentMethodType ? order.paymentMethodType === 'spei' : order.paymentMethod === 'transfer';
  const proofs = order.paymentProofs || [];
  const canUploadProof = isSpei && isAwaitingPayment(order) && Boolean(config?.customerProofUpload);
  const a = order.shippingAddress;
  const point = order.deliveryMethod === 'pickup' ? order.pickupPoint : null;
  const paymentLabel = order.paymentMethodLabel || LEGACY_PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod;
  const regular = (order.items || []).reduce((sum, i) => sum + (i.compareAtPrice || i.unitPrice) * i.quantity, 0);
  const itemsTotal = (order.items || []).reduce((sum, i) => sum + i.subtotal, 0);
  const savings = regular - itemsTotal;
  const href = mapsHref(point);

  return (
    <div className="acc-section">
      <button type="button" className="acc-link acc-back" onClick={orders.close}>
        <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Todos mis pedidos
      </button>

      <div className="acc-card">
        <div className="acc-card-head">
          <h2>
            Pedido {formatOrderFolio(order.orderNumber)}
            <small>Hecho el {formatDate(order.createdAt)}</small>
          </h2>
          <span className={`acc-status is-${order.status}`}>{orderStatusLabel(order.status, order.deliveryMethod)}</span>
        </div>
        <StatusTimeline order={order} />
      </div>

      <div className="acc-grid-2">
        <div className="acc-card">
          <h3 className="acc-card-title">
            <i className={point || order.deliveryMethod === 'pickup' ? 'fa-solid fa-store' : 'fa-solid fa-truck-fast'} aria-hidden="true" />{' '}
            {order.deliveryMethod === 'pickup' ? 'Recoger en punto de venta' : 'Envío a domicilio'}
          </h3>
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
              {a.phone ? <span>Tel. {a.phone}</span> : null}
            </p>
          ) : (
            <p className="acc-muted">Te contactamos para coordinar la entrega.</p>
          )}
        </div>
        <div className="acc-card">
          <h3 className="acc-card-title">
            <i className="fa-solid fa-wallet" aria-hidden="true" /> Pago
          </h3>
          <p className="acc-lines">
            <strong>{paymentLabel}</strong>
            {order.status === 'pending' ? (
              <span>
                {order.paymentMethodType === 'manual' && order.paymentInstructions
                  ? order.paymentInstructions
                  : 'Te enviamos por correo los datos para pagar. Confirmamos tu pedido al recibir el pago.'}
              </span>
            ) : null}
          </p>
          {isSpei ? <PaymentProofPanel proofs={proofs} canUpload={canUploadProof} uploader={uploader} /> : null}
        </div>
      </div>

      <div className="acc-card">
        <h3 className="acc-card-title">Productos</h3>
        <ul className="acc-items">
          {(order.items || []).map((item, i) => (
            <li key={`${i}-${item.productName}`}>
              <span>
                {item.productName} <small>×{item.quantity}</small>
              </span>
              <span className="acc-items-price">
                {item.compareAtPrice ? <s>{formatMxn(item.compareAtPrice * item.quantity)}</s> : null}
                {formatMxn(item.subtotal)}
              </span>
            </li>
          ))}
          {savings > 0 ? (
            <li className="acc-items-discount">
              <span>Ahorraste</span>
              <span>−{formatMxn(savings)}</span>
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
        {order.notes ? <p className="acc-muted acc-notes">Notas: {order.notes}</p> : null}

        <Alert type="success">{orders.reorderMessage}</Alert>
        <Alert type="error">{orders.reorderError}</Alert>
        <Alert type="error">{orders.downloadError}</Alert>
        <div className="acc-actions">
          <button type="button" className="acc-btn" onClick={() => orders.reorder(order)}>
            <i className="fa-solid fa-rotate-right" aria-hidden="true" /> Comprar de nuevo
          </button>
          <button type="button" className="acc-btn acc-btn--ghost" onClick={() => orders.downloadReceipt(order)} disabled={orders.isDownloadingReceipt}>
            <i className="fa-regular fa-file-pdf" aria-hidden="true" /> {orders.isDownloadingReceipt ? 'Abriendo…' : 'Descarga tu ticket'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AccountOrders = ({ account }) => {
  const { orders } = account;
  if (orders.selected) return <OrderDetail orders={orders} />;

  return (
    <div className="acc-section">
      <div className="acc-card">
        <div className="acc-card-head">
          <h2>Mis pedidos</h2>
        </div>
        {orders.isLoading ? <p className="acc-muted">Cargando tus pedidos…</p> : null}
        <Alert type="error">{orders.error}</Alert>
        {!orders.isLoading && !orders.error && orders.list.length === 0 ? (
          <div className="acc-empty">
            <i className="fa-solid fa-box-open" aria-hidden="true" />
            <p>Aún no has hecho pedidos.</p>
            <Link to="/tienda" className="acc-btn">
              Ir a la tienda
            </Link>
          </div>
        ) : null}
        <ul className="acc-orders">
          {orders.list.map((order) => (
            <li key={order._id}>
              <button type="button" className="acc-order-row" onClick={() => orders.open(order._id)}>
                <span className="acc-order-main">
                  <strong>{formatOrderFolio(order.orderNumber)}</strong>
                  <span>
                    {formatDate(order.createdAt)} · {order.items?.length || 0} producto{order.items?.length === 1 ? '' : 's'} ·{' '}
                    {order.deliveryMethod === 'pickup' ? 'Recoger' : 'Envío'}
                  </span>
                </span>
                <span className={`acc-status is-${order.status}`}>{orderStatusLabel(order.status, order.deliveryMethod)}</span>
                <span className="acc-order-total">{formatMxn(order.total)}</span>
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default AccountOrders;
