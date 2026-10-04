// src/pages/Cart.jsx — carrito y checkout en una sola página.
//
// Cupón (POST /api/coupons/validate, vista previa), puntos de lealtad (solo
// con sesión y con el programa activo: GET /api/loyalty/me), entrega (a
// domicilio o recoger, de StoreConfig) y método de pago. El pedido va por
// POST /api/orders/public, que recalcula todo (precios, cupón, puntos, envío);
// aquí solo se muestra la estimación. Al terminar lleva a /pedido/:id con su
// token (subir comprobante de transferencia).
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAuthHeader, useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { useCart } from '../hooks/useCart';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { Notice, PageTitle } from '../ui/bits';
import { apiFetch } from '../utils/apiClient';
import { EMPTY_SHIPPING_ADDRESS, SHIPPING_ADDRESS_FIELDS, pickShippingAddress } from '../utils/address';
import { EMAIL_REGEX, errorText, money } from '../utils/format';
import { rememberOrderToken } from './Order';

const round2 = (n) => Math.round(n * 100) / 100;

const shippingFor = (config, method, itemsTotal, freeShipping) => {
  const s = config?.shipping || {};
  const cost = Number(s.cost) || 0;
  if (method !== 'shipping' || freeShipping || !s.enabled || cost <= 0 || itemsTotal <= 0) return 0;
  return Number(s.freeFrom) > 0 && itemsTotal >= Number(s.freeFrom) ? 0 : cost;
};

const Cart = () => {
  const cart = useCart();
  const navigate = useNavigate();
  const { config } = useStoreConfig();
  const { isAuthenticated, user, token } = useAuth();
  const loyalty = useApi(isAuthenticated ? '/api/loyalty/me' : null, getAuthHeader()).data;
  const points = loyalty?.programs?.points?.enabled ? loyalty.programs.points : null;
  const balance = loyalty?.account?.points || 0;

  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [usePoints, setUsePoints] = useState('');
  const [delivery, setDelivery] = useState('');
  const [pickupId, setPickupId] = useState('');
  const [contact, setContact] = useState({ customerName: '', customerEmail: '', customerPhone: '' });
  const [address, setAddress] = useState(EMPTY_SHIPPING_ADDRESS);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [paymentId, setPaymentId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const homeDelivery = config?.homeDeliveryEnabled !== false;
  const pickupPoints = config?.pickupPoints || [];
  const payments = (config?.paymentMethods || []).filter((m) => (delivery === 'pickup' ? m.forPickup !== false : m.forShipping !== false));

  useEffect(() => {
    if (!delivery && config) {
      if (homeDelivery) setDelivery('shipping');
      else if (pickupPoints.length) {
        setDelivery('pickup');
        setPickupId(pickupPoints[0]._id);
      }
    }
  }, [config, delivery, homeDelivery, pickupPoints]);

  useEffect(() => {
    if (payments.length && !payments.some((m) => m._id === paymentId)) setPaymentId(payments[0]._id);
  }, [payments, paymentId]);

  // Con sesión: datos de contacto y libreta de direcciones de la cuenta.
  useEffect(() => {
    if (!isAuthenticated) return;
    setContact((c) => ({ customerName: c.customerName || user.name || '', customerEmail: user.email || c.customerEmail, customerPhone: c.customerPhone || user.phone || '' }));
    apiFetch(`/api/users/${user._id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((fresh) => {
        const list = fresh.addresses || [];
        setSavedAddresses(list);
        const def = list.find((a) => a.isDefault) || list[0];
        if (def) setAddress(pickShippingAddress(def));
      })
      .catch(() => {});
  }, [isAuthenticated, user, token]);

  // ---- Cupón ----
  const validateCoupon = async (code) => {
    const data = await apiFetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal: cart.subtotal, deliveryMethod: delivery || undefined, customerEmail: contact.customerEmail || undefined }),
    });
    return { code: data.code, discount: data.discount || 0, freeShipping: Boolean(data.freeShipping), message: data.message };
  };

  const applyCoupon = async (e) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    setCouponError('');
    try {
      setCoupon(await validateCoupon(couponInput.trim()));
      setCouponInput('');
    } catch (err) {
      setCouponError(errorText(err));
    }
  };

  // Si cambia el subtotal o la entrega, se revalida (compra mínima, envío gratis).
  useEffect(() => {
    if (!coupon) return undefined;
    const timer = setTimeout(() => {
      validateCoupon(coupon.code)
        .then(setCoupon)
        .catch((err) => {
          if (!err.status) return;
          setCoupon(null);
          setCouponError(`Quitamos el cupón ${coupon.code}: ${err.message}`);
        });
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.subtotal, delivery]);

  // ---- Totales (estimación; el backend calcula los reales) ----
  const discount = coupon?.discount || 0;
  const itemsTotal = Math.max(0, cart.subtotal - discount);
  const maxPoints = points ? Math.min(balance, round2((itemsTotal * points.maxRedeemPercent) / 100)) : 0;
  const pointsUsed = Math.min(Number(usePoints) || 0, maxPoints);
  const shipping = shippingFor(config, delivery, itemsTotal, coupon?.freeShipping);
  const total = round2(itemsTotal - pointsUsed + shipping);
  const earnPreview = points ? round2(((itemsTotal - pointsUsed) * points.earnPercent) / 100) : 0;
  const canUsePoints = points && maxPoints > 0 && maxPoints >= (points.minRedeem || 0);

  const selectedPayment = useMemo(() => payments.find((m) => m._id === paymentId), [payments, paymentId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!cart.lines.length) return setError('Tu carrito está vacío.');
    if (!delivery) return setError('Elige cómo quieres recibir tu pedido.');
    if (delivery === 'pickup' && !pickupId) return setError('Elige dónde recoger.');
    if (!contact.customerName.trim() || !EMAIL_REGEX.test(contact.customerEmail.trim()) || contact.customerPhone.replace(/\D/g, '').length < 10) {
      return setError('Completa tu nombre, un correo válido y un teléfono de 10 dígitos.');
    }
    if (delivery === 'shipping') {
      const missing = SHIPPING_ADDRESS_FIELDS.filter((f) => f.required && !String(address[f.name] || '').trim());
      if (missing.length) return setError(`Completa la dirección: ${missing.map((f) => f.label.toLowerCase()).join(', ')}.`);
    }
    if (!selectedPayment) return setError('Elige un método de pago.');
    if (pointsUsed && points.minRedeem && pointsUsed < points.minRedeem) return setError(`Puedes usar puntos desde ${money(points.minRedeem)}.`);

    setSending(true);
    try {
      const payload = {
        ...contact,
        deliveryMethod: delivery,
        paymentMethod: selectedPayment._id,
        items: cart.lines.map((l) => ({ product: l.id, ...(l.variantId ? { variant: l.variantId } : {}), quantity: l.qty })),
        ...(delivery === 'pickup' ? { pickupPointId: pickupId } : { shippingAddress: address }),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(coupon ? { couponCode: coupon.code } : {}),
        ...(pointsUsed > 0 ? { usePoints: pointsUsed } : {}),
      };
      const data = await apiFetch('/api/orders/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      rememberOrderToken(data.order._id, data.orderAccessToken);
      cart.clear();
      navigate(`/pedido/${data.order._id}?nuevo=1`);
    } catch (err) {
      if (String(err.code || '').startsWith('COUPON_')) setCoupon(null);
      if (String(err.code || '').includes('POINTS')) setUsePoints('');
      setError(errorText(err, 'No pudimos crear tu pedido.'));
    } finally {
      setSending(false);
    }
  };

  if (!cart.lines.length) {
    return (
      <div className="wrap narrow">
        <PageTitle title="Carrito" />
        <p className="muted">Tu carrito está vacío.</p>
        <Link className="btn" to="/tienda">Ir a la tienda</Link>
      </div>
    );
  }

  const onContact = (e) => setContact((c) => ({ ...c, [e.target.name]: e.target.value }));
  const onAddress = (e) => setAddress((a) => ({ ...a, [e.target.name]: e.target.value }));

  return (
    <div className="wrap">
      <PageTitle title="Carrito" />
      <form className="checkout" onSubmit={submit} noValidate>
        <div className="checkout__main">
          <section className="card">
            <ul className="cart-lines">
              {cart.lines.map((l) => (
                <li key={l.key}>
                  {l.image ? <img src={l.image} alt="" /> : <span className="thumb-empty" />}
                  <div className="cart-lines__info">
                    <Link to={`/tienda/${l.id}`}>{l.name}</Link>
                    {l.variantLabel ? <small className="muted">{l.variantLabel}</small> : null}
                    <small>{money(l.price)} c/u</small>
                  </div>
                  <div className="qty">
                    <button type="button" onClick={() => cart.setQty(l.key, l.qty - 1)} aria-label="Menos">−</button>
                    <span>{l.qty}</span>
                    <button type="button" onClick={() => cart.setQty(l.key, l.qty + 1)} disabled={l.qty >= cart.capOf(l)} aria-label="Más">+</button>
                  </div>
                  <strong>{money(l.price * l.qty)}</strong>
                  <button type="button" className="link-btn" onClick={() => cart.remove(l.key)} aria-label={`Quitar ${l.name}`}>
                    <i className="fa-regular fa-trash-can" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Entrega</h2>
            <div className="radio-list">
              {homeDelivery ? (
                <label className="radio-row">
                  <input type="radio" name="delivery" checked={delivery === 'shipping'} onChange={() => setDelivery('shipping')} />
                  <span>Envío a domicilio{config?.shipping?.enabled && config.shipping.cost > 0 ? ` · ${money(config.shipping.cost)}${config.shipping.freeFrom ? ` (gratis desde ${money(config.shipping.freeFrom)})` : ''}` : ' · gratis'}</span>
                </label>
              ) : null}
              {pickupPoints.map((p) => (
                <label key={p._id} className="radio-row">
                  <input type="radio" name="delivery" checked={delivery === 'pickup' && pickupId === p._id} onChange={() => { setDelivery('pickup'); setPickupId(p._id); }} />
                  <span>
                    Recoger en {p.name} · gratis
                    {p.address ? <small className="muted"> {p.address}</small> : null}
                    {p.schedule ? <small className="muted"> {p.schedule}</small> : null}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Tus datos</h2>
            {!isAuthenticated ? <p className="muted small"><Link to="/login?volver=/carrito">Inicia sesión</Link> para usar tus puntos y guardar tu carrito, o continúa como invitada.</p> : null}
            <div className="form-grid">
              <label>Nombre<input name="customerName" value={contact.customerName} onChange={onContact} autoComplete="name" /></label>
              <label>Correo<input name="customerEmail" type="email" value={contact.customerEmail} onChange={onContact} readOnly={isAuthenticated} autoComplete="email" /></label>
              <label>Teléfono<input name="customerPhone" type="tel" value={contact.customerPhone} onChange={onContact} autoComplete="tel" /></label>
            </div>
            {delivery === 'shipping' ? (
              <>
                <h3>Dirección de entrega</h3>
                {savedAddresses.length ? (
                  <select aria-label="Mis direcciones" onChange={(e) => { const a = savedAddresses.find((x) => x._id === e.target.value); setAddress(a ? pickShippingAddress(a) : EMPTY_SHIPPING_ADDRESS); }} defaultValue={(savedAddresses.find((a) => a.isDefault) || savedAddresses[0])._id}>
                    {savedAddresses.map((a) => <option key={a._id} value={a._id}>{a.label || `${a.street} ${a.exteriorNumber}`}</option>)}
                    <option value="">Otra dirección…</option>
                  </select>
                ) : null}
                <div className="form-grid">
                  {SHIPPING_ADDRESS_FIELDS.map((f) => (
                    <label key={f.name} className={f.wide ? 'wide' : ''}>
                      {f.label}
                      <input name={f.name} value={address[f.name] || ''} maxLength={f.maxLength} placeholder={f.placeholder} onChange={onAddress} />
                    </label>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="card">
            <h2>Pago</h2>
            {!payments.length ? <p className="muted">No hay métodos de pago para esta forma de entrega.</p> : null}
            <div className="radio-list">
              {payments.map((m) => (
                <label key={m._id} className="radio-row">
                  <input type="radio" name="payment" checked={paymentId === m._id} onChange={() => setPaymentId(m._id)} />
                  <span>
                    {m.label}
                    {m.description ? <small className="muted"> {m.description}</small> : null}
                  </span>
                </label>
              ))}
            </div>
            <label>Notas (opcional)<textarea rows="2" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </section>
        </div>

        <aside className="card summary checkout__summary">
          <h2>Resumen</h2>
          <div className="coupon-box">
            {coupon ? (
              <p className="ok">
                Cupón <strong>{coupon.code}</strong> {coupon.message ? `· ${coupon.message}` : ''}{' '}
                <button type="button" className="link-btn" onClick={() => setCoupon(null)}>Quitar</button>
              </p>
            ) : (
              <div className="inline-form">
                <input placeholder="¿Tienes un cupón?" value={couponInput} onChange={(e) => { setCouponError(''); setCouponInput(e.target.value.toUpperCase().replace(/\s/g, '')); }} aria-label="Código de cupón" />
                <button type="button" className="btn btn--ghost btn--small" onClick={applyCoupon}>Aplicar</button>
              </div>
            )}
            <Notice type="error">{couponError}</Notice>
          </div>

          {points ? (
            <div className="points-box">
              <p><i className="fa-solid fa-coins" aria-hidden="true" /> Tienes <strong>{money(balance)}</strong> en puntos.</p>
              {canUsePoints ? (
                <div className="inline-form">
                  <input type="number" min="0" step="0.01" max={maxPoints} value={usePoints} onChange={(e) => setUsePoints(e.target.value)} placeholder={`Hasta ${money(maxPoints)}`} aria-label="Puntos a usar" />
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setUsePoints(String(maxPoints))}>Usar máximo</button>
                </div>
              ) : (
                <small className="muted">{balance > 0 ? `Puedes usarlos desde ${money(points.minRedeem)}.` : 'Ganas puntos con cada compra pagada.'}</small>
              )}
            </div>
          ) : null}

          <ul className="lines">
            <li><span>Productos</span><span>{money(cart.subtotal)}</span></li>
            {discount ? <li><span>Cupón</span><span>−{money(discount)}</span></li> : null}
            {pointsUsed ? <li><span>Puntos</span><span>−{money(pointsUsed)}</span></li> : null}
            <li><span>Envío</span><span>{shipping ? money(shipping) : 'Gratis'}</span></li>
            <li className="total"><span>Total</span><span>{money(total)}</span></li>
          </ul>
          {points && earnPreview > 0 ? <small className="muted">Con esta compra ganas aprox. {money(earnPreview)} en puntos al confirmarse el pago.</small> : null}
          {!isAuthenticated ? <small className="muted">Las compras con cuenta suman puntos de lealtad.</small> : null}
          <Notice type="error">{error}</Notice>
          <button type="submit" className="btn btn--block" disabled={sending}>{sending ? 'Enviando…' : 'Confirmar pedido'}</button>
        </aside>
      </form>
    </div>
  );
};

export default Cart;
