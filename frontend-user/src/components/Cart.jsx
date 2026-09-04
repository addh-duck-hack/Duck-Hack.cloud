// src/components/Cart.jsx — PROPUESTA B: canasta + checkout de 3 pasos.
//
// Checkout real: "Confirmar pedido" llama useCart().submitOrder(), que pega a
// POST /api/orders/public (sin pasarela — el pedido entra "pendiente" y la
// tienda confirma el pago/entrega a mano, ver el correo que manda el backend).
// El folio de la confirmación es el orderNumber real que regresa la API, no
// uno simulado.
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useCart, formatMxn, formatMxnLong, formatOptions } from '../hooks/useCart';
import { iconForCategory } from './BrandMarks';
import './Cart.css';

const STEPS = ['Tu canasta', 'Datos de envío', '¡Gracias!'];

const PAYMENT_NOTES = {
  transfer: 'Te contactamos con los datos para la transferencia; tu pedido queda apartado como pendiente de pago.',
  pickup: 'Puedes pasar a recoger y pagar en la finca; te escribimos para coordinar.',
};

const INITIAL_FORM = { customerName: '', customerEmail: '', customerPhone: '', shippingAddress: '' };

const Cart = () => {
  usePageMeta('Canasta');
  const navigate = useNavigate();
  const { lines, subtotal, shipping, total, count, freeShippingFrom, setQty, removeItem, clear, submitOrder } = useCart();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [order, setOrder] = useState(null);

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitShipping = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);
    try {
      const created = await submitOrder({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        shippingAddress: form.shippingAddress,
        paymentMethod,
      });
      setOrder(created);
      setStep(2);
      window.scrollTo(0, 0);
    } catch (err) {
      setSubmitError(err.message || 'No fue posible enviar tu pedido. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueShopping = () => {
    clear();
    setForm(INITIAL_FORM);
    setPaymentMethod('transfer');
    setOrder(null);
    setStep(0);
    navigate('/tienda');
  };

  const eyebrow = ['Tu canasta', 'Casi listo', 'Recibido'][step];

  if (lines.length === 0 && step < 2) {
    return (
      <section className="cart-view">
        <span className="eyebrow">Tu canasta</span>
        <h1 className="cart-title">Tu canasta está vacía</h1>
        <p className="section-sub">Todavía no agregas nada. Empieza por la carta.</p>
        <Link className="btn btn-solid" to="/tienda">Ir a la tienda</Link>
      </section>
    );
  }

  return (
    <section className="cart-view">
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="cart-title">{STEPS[step]}</h1>

      {step === 0 && (
        <div className="cart-grid">
          <div className="cart-lines">
            {lines.map((l) => (
              <div className="cline" key={l.key}>
                <span className="cf">
                  {l.image ? (
                    <img src={l.image} alt={l.name} />
                  ) : (
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      <use href={`#${iconForCategory(l.category)}`} />
                    </svg>
                  )}
                </span>
                <div className="cinfo">
                  <div className="cn">{l.name}</div>
                  <div className="cm">
                    {formatOptions(l.options) ? `${formatOptions(l.options)} · ` : ''}
                    {formatMxn(l.price)} c/u
                  </div>
                  <div className="cqty">
                    <button type="button" aria-label="Menos" onClick={() => setQty(l.key, l.qty - 1)}>–</button>
                    <span>{l.qty}</span>
                    <button type="button" aria-label="Más" onClick={() => setQty(l.key, l.qty + 1)}>+</button>
                    <button type="button" className="rm" onClick={() => removeItem(l.key)}>Quitar</button>
                  </div>
                </div>
                <div className="cp">{formatMxn(l.price * l.qty)}</div>
              </div>
            ))}
          </div>

          <aside className="summary">
            <h3>Resumen</h3>
            <div className="srow"><span>Subtotal</span><span>{formatMxn(subtotal)}</span></div>
            <div className="srow">
              <span>Envío</span>
              <span>{shipping === 0 ? 'Gratis' : formatMxn(shipping)}</span>
            </div>
            {shipping > 0 && (
              <p className="ship-hint">
                Te faltan {formatMxn(freeShippingFrom - subtotal)} para envío gratis.
              </p>
            )}
            <div className="srow total"><span>Total</span><span>{formatMxnLong(total)}</span></div>
            <button className="btn btn-solid block" onClick={() => { setStep(1); window.scrollTo(0, 0); }}>
              Continuar al pago
            </button>
            <Link className="cart-cont" to="/tienda">← Seguir viendo la carta</Link>
          </aside>
        </div>
      )}

      {step === 1 && (
        <div className="cart-grid">
          <form className="ship-form" onSubmit={handleSubmitShipping}>
            {submitError ? <div className="checkout-error">{submitError}</div> : null}

            <div className="field">
              <label htmlFor="s-name">Nombre completo</label>
              <input id="s-name" name="customerName" value={form.customerName} onChange={handleFieldChange} required placeholder="María Fernanda Ruiz" />
            </div>
            <div className="field">
              <label htmlFor="s-email">Correo</label>
              <input id="s-email" name="customerEmail" type="email" value={form.customerEmail} onChange={handleFieldChange} required placeholder="tu@correo.mx" />
            </div>
            <div className="field">
              <label htmlFor="s-phone">Teléfono / WhatsApp</label>
              <input id="s-phone" name="customerPhone" value={form.customerPhone} onChange={handleFieldChange} required placeholder="55 1234 5678" />
            </div>
            <div className="field">
              <label htmlFor="s-address">
                {paymentMethod === 'transfer' ? 'Dirección de envío' : 'Dirección de envío (opcional)'}
              </label>
              <input
                id="s-address"
                name="shippingAddress"
                value={form.shippingAddress}
                onChange={handleFieldChange}
                required={paymentMethod === 'transfer'}
                placeholder="Calle, número, colonia, ciudad, CP"
              />
            </div>

            <div className="field"><label>Método de pago</label></div>
            <div className="pay">
              <label>
                <input
                  type="radio"
                  name="pay"
                  checked={paymentMethod === 'transfer'}
                  onChange={() => setPaymentMethod('transfer')}
                />
                <span>Transferencia / SPEI<small>Te enviamos los datos y confirmamos al recibir el pago.</small></span>
              </label>
              <label>
                <input
                  type="radio"
                  name="pay"
                  checked={paymentMethod === 'pickup'}
                  onChange={() => setPaymentMethod('pickup')}
                />
                <span>Pago en finca<small>Recoge y paga en Xicotepec.</small></span>
              </label>
            </div>

            <button type="submit" className="btn btn-solid block" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando…' : 'Confirmar pedido'}
            </button>
            <button type="button" className="cart-cont as-btn" onClick={() => setStep(0)} disabled={isSubmitting}>
              ← Volver a la canasta
            </button>
          </form>

          <aside className="summary">
            <h3>{count} {count === 1 ? 'producto' : 'productos'}</h3>
            {lines.map((l) => (
              <div className="srow" key={l.key}>
                <span>{l.name} ×{l.qty}</span>
                <span>{formatMxn(l.price * l.qty)}</span>
              </div>
            ))}
            <div className="srow"><span>Envío</span><span>{shipping === 0 ? 'Gratis' : formatMxn(shipping)}</span></div>
            <div className="srow total"><span>Total</span><span>{formatMxnLong(total)}</span></div>
          </aside>
        </div>
      )}

      {step === 2 && order && (
        <div className="confirm">
          <div className="confirm-seal">✓</div>
          <h2>Pedido recibido</h2>
          <p className="oref">Folio TAC-{String(order.orderNumber ?? '').padStart(5, '0')}</p>
          <p className="confirm-note">{PAYMENT_NOTES[order.paymentMethod] || PAYMENT_NOTES[paymentMethod]}</p>
          {(() => {
            const orderCount = order.items?.length
              ? order.items.reduce((sum, i) => sum + i.quantity, 0)
              : count;
            return (
              <p className="confirm-total">
                Total {formatMxnLong(order.total)} · {orderCount} {orderCount === 1 ? 'producto' : 'productos'}
              </p>
            );
          })()}
          <button className="btn btn-solid" onClick={handleContinueShopping}>
            Seguir comprando
          </button>
        </div>
      )}
    </section>
  );
};

export default Cart;
