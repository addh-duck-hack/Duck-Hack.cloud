// src/components/Cart.jsx — PROPUESTA B: canasta + checkout de 3 pasos.
//
// AVISO: el checkout es SOLO VISUAL en esta entrega. No hay endpoint público de
// pedidos todavía (es trabajo de otra rama). "Confirmar pedido" no envía nada a
// ningún servidor: muestra una confirmación con folio simulado y vacía la
// canasta. Ver el plan de Café Tacita, Fase 2.
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useCart, formatMxn, formatMxnLong } from '../hooks/useCart';
import { iconForCategory } from './BrandMarks';
import './Cart.css';

const STEPS = ['Tu canasta', 'Datos de envío', '¡Gracias!'];

const Cart = () => {
  usePageMeta('Canasta');
  const navigate = useNavigate();
  const { lines, subtotal, shipping, total, count, freeShippingFrom, setQty, removeItem, clear } = useCart();

  const [step, setStep] = useState(0);
  const [folio, setFolio] = useState('');

  const goToConfirmation = () => {
    setFolio(`TAC-${Math.floor(10000 + Math.random() * 89999)}`);
    setStep(2);
    window.scrollTo(0, 0);
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
                    {l.grind !== '—' ? `${l.grind} · ` : ''}
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
          <form className="ship-form" onSubmit={(e) => { e.preventDefault(); goToConfirmation(); }}>
            <div className="field"><label htmlFor="s-name">Nombre completo</label><input id="s-name" required placeholder="María Fernanda Ruiz" /></div>
            <div className="field"><label htmlFor="s-email">Correo</label><input id="s-email" type="email" required placeholder="tu@correo.mx" /></div>
            <div className="field"><label htmlFor="s-phone">Teléfono / WhatsApp</label><input id="s-phone" required placeholder="55 1234 5678" /></div>
            <div className="field"><label htmlFor="s-addr">Dirección de envío</label><input id="s-addr" required placeholder="Calle, número, colonia, ciudad, CP" /></div>

            <div className="field"><label>Método de pago</label></div>
            <div className="pay">
              <label><input type="radio" name="pay" defaultChecked /><span>Transferencia / SPEI<small>Te enviamos los datos y confirmamos al recibir el pago.</small></span></label>
              <label><input type="radio" name="pay" /><span>Tarjeta<small>Pasarela por definir en la construcción (Mercado Pago / Stripe / Clip).</small></span></label>
              <label><input type="radio" name="pay" /><span>Pago en finca o feria<small>Recoge y paga en Xicotepec.</small></span></label>
            </div>

            <button type="submit" className="btn btn-solid block">Confirmar pedido</button>
            <button type="button" className="cart-cont as-btn" onClick={() => setStep(0)}>← Volver a la canasta</button>
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

      {step === 2 && (
        <div className="confirm">
          <div className="confirm-seal">✓</div>
          <h2>Pedido recibido</h2>
          <p className="oref">Folio {folio}</p>
          <p className="confirm-note">
            Te escribimos por WhatsApp con los datos de pago y el seguimiento. Tostamos tu café el día que lo enviamos.
          </p>
          <p className="confirm-total">Total {formatMxnLong(total)} · {count} {count === 1 ? 'producto' : 'productos'}</p>
          <p className="demo-note">
            Demostración: este checkout todavía no procesa pagos ni envía el pedido a un servidor.
          </p>
          <button className="btn btn-solid" onClick={() => { clear(); setStep(0); navigate('/tienda'); }}>
            Seguir comprando
          </button>
        </div>
      )}
    </section>
  );
};

export default Cart;
