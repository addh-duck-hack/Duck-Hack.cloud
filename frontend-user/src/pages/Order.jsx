// src/pages/Order.jsx — página del pedido: FRONTEND_URL/pedido/<id>?token=…
// (enlace del correo de confirmación). Estado, productos, descuentos (cupón y
// puntos), datos para transferir, subir comprobante y descargar ticket.
// Acceso con el token del pedido (X-Order-Token) o con la sesión de la dueña.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getAuthHeader } from '../hooks/useAuth';
import { Loading, Notice } from '../ui/bits';
import { apiFetch, getApiBaseUrl } from '../utils/apiClient';
import { ORDER_STATUS, errorText, fmtShortDate, folio, money } from '../utils/format';

const tokenKey = (id) => `salon.order-token.${id}`;

export const rememberOrderToken = (id, token) => {
  if (!id || !token) return;
  try {
    sessionStorage.setItem(tokenKey(id), token);
  } catch {
    // sin almacenamiento
  }
};
const readToken = (id) => {
  try {
    return sessionStorage.getItem(tokenKey(id)) || '';
  } catch {
    return '';
  }
};

const PROOF_STATUS = { pending: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado' };

const Order = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [token] = useState(() => {
    const fromUrl = params.get('token') || '';
    if (fromUrl) rememberOrderToken(id, fromUrl);
    return fromUrl || readToken(id);
  });
  const isNew = Boolean(params.get('nuevo'));
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [file, setFile] = useState(null);
  const [upload, setUpload] = useState({ busy: false, error: '', ok: '' });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('token') || url.searchParams.has('nuevo')) {
      url.searchParams.delete('token');
      url.searchParams.delete('nuevo');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const headers = useCallback(() => (token ? { 'X-Order-Token': token } : getAuthHeader()), [token]);

  const load = useCallback(async () => {
    try {
      setSummary(await apiFetch(`/api/orders/${id}/summary`, { headers: headers() }));
    } catch (err) {
      setLoadError([401, 403].includes(err.status) ? 'Este enlace ya no es válido. Inicia sesión para ver tus pedidos.' : err.status === 404 ? 'No encontramos este pedido.' : errorText(err));
    }
  }, [id, headers]);

  useEffect(() => {
    load();
  }, [load]);

  const sendProof = async (e) => {
    e.preventDefault();
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setUpload({ busy: false, error: 'El archivo pesa más de 8 MB.', ok: '' });
    setUpload({ busy: true, error: '', ok: '' });
    try {
      const body = new FormData();
      body.append('file', file);
      const data = await apiFetch(`/api/orders/${id}/payment-proof`, { method: 'POST', headers: headers(), body });
      setUpload({ busy: false, error: '', ok: data.message || 'Recibimos tu comprobante.' });
      setFile(null);
      e.target.reset();
      load();
    } catch (err) {
      setUpload({ busy: false, error: errorText(err), ok: '' });
    }
  };

  const downloadTicket = async () => {
    const res = await fetch(`${getApiBaseUrl()}/api/orders/${id}/pdf`, { headers: headers() });
    if (res.ok) window.open(URL.createObjectURL(await res.blob()), '_blank');
  };

  if (loadError) {
    return (
      <div className="wrap narrow">
        <Notice type="error">{loadError}</Notice>
        <Link className="btn" to="/login">Iniciar sesión</Link>
      </div>
    );
  }
  if (!summary) return <div className="wrap narrow"><Loading /></div>;

  const { order, payment, paymentProofs = [], canUploadProof } = summary;
  const productsTotal = order.items.reduce((s, i) => s + i.subtotal, 0);
  const hasPendingProof = paymentProofs.some((p) => p.status === 'pending');

  return (
    <div className="wrap narrow">
      <header className="page-title">
        <h1>Pedido {folio('PED', order.orderNumber)}</h1>
        <span className={`status status--${order.status}`}>{ORDER_STATUS[order.status] || order.status}</span>
      </header>
      {isNew ? <Notice type="success">¡Gracias por tu compra! Te mandamos la confirmación por correo.</Notice> : null}

      <section className="card">
        <ul className="lines">
          {order.items.map((i, n) => (
            <li key={n}>
              <span>{i.productName}{i.variantLabel ? ` · ${i.variantLabel}` : ''} × {i.quantity}</span>
              <span>{money(i.subtotal)}</span>
            </li>
          ))}
          <li><span>Productos</span><span>{money(productsTotal)}</span></li>
          {order.discount?.amount ? <li><span>Cupón {order.discount.code}</span><span>−{money(order.discount.amount)}</span></li> : null}
          {order.loyalty?.redeemed ? <li><span>Puntos usados</span><span>−{money(order.loyalty.redeemed)}</span></li> : null}
          <li><span>Envío</span><span>{order.shippingCost ? money(order.shippingCost) : 'Gratis'}</span></li>
          <li className="total"><span>Total</span><span>{money(order.total)}</span></li>
        </ul>
        {order.loyalty?.earned ? <p className="ok"><i className="fa-solid fa-coins" aria-hidden="true" /> Ganaste {money(order.loyalty.earned)} en puntos con este pedido.</p> : null}
        <p className="muted small">
          {order.deliveryMethod === 'pickup'
            ? `Recoger en ${order.pickupPoint?.name || 'tienda'}${order.pickupPoint?.address ? ` · ${order.pickupPoint.address}` : ''}`
            : order.shippingAddress
              ? `Envío a ${order.shippingAddress.street} ${order.shippingAddress.exteriorNumber}, ${order.shippingAddress.neighborhood}, ${order.shippingAddress.city}`
              : ''}
          {order.paymentMethodLabel ? ` · Pago: ${order.paymentMethodLabel}` : ''}
        </p>
        {order.shipment?.trackingNumber ? (
          <p>Guía: {order.shipment.carrier} {order.shipment.trackingUrl ? <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">{order.shipment.trackingNumber}</a> : order.shipment.trackingNumber}</p>
        ) : null}
        <button type="button" className="btn btn--ghost btn--small" onClick={downloadTicket}><i className="fa-regular fa-file-pdf" aria-hidden="true" /> Ticket</button>
      </section>

      {payment?.spei ? (
        <section className="card">
          <h2>Datos para transferir</h2>
          <dl className="attrs">
            <dt>Titular</dt><dd>{payment.spei.accountHolderName}</dd>
            <dt>Banco</dt><dd>{payment.spei.bank}</dd>
            <dt>CLABE</dt><dd>{payment.spei.clabe}</dd>
            <dt>Monto</dt><dd>{money(order.total)}</dd>
            <dt>Concepto</dt><dd>{folio('PED', order.orderNumber)}</dd>
          </dl>
        </section>
      ) : null}
      {payment?.instructions ? <section className="card"><h2>Cómo pagar</h2><p>{payment.instructions}</p></section> : null}

      {paymentProofs.length || canUploadProof ? (
        <section className="card">
          <h2>Comprobante de pago</h2>
          <ul className="plain">
            {paymentProofs.map((p) => (
              <li key={p._id}>
                {fmtShortDate(p.uploadedAt)} · <strong>{PROOF_STATUS[p.status]}</strong>
                {p.status === 'rejected' && p.rejectReason ? <small className="muted"> — {p.rejectReason}</small> : null}
              </li>
            ))}
          </ul>
          {canUploadProof && !hasPendingProof ? (
            <form className="stack" onSubmit={sendProof}>
              <label>Foto o PDF de tu transferencia (hasta 8 MB)
                <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <button className="btn" disabled={!file || upload.busy}>{upload.busy ? 'Enviando…' : 'Enviar comprobante'}</button>
            </form>
          ) : null}
          <Notice type="error">{upload.error}</Notice>
          <Notice type="success">{upload.ok}</Notice>
        </section>
      ) : null}

      <p><Link to="/tienda">← Seguir comprando</Link></p>
    </div>
  );
};

export default Order;
