// src/components/checkout/CheckoutSummary.jsx
//
// Columna de resumen del checkout (fija al hacer scroll en escritorio):
// productos (desde el paso 2), subtotal, descuentos, cupón, envío según la
// entrega elegida, total, meta de envío gratis, el botón del paso y su error.
import React, { useState } from 'react';
import { formatMxn, formatOptions } from '../../hooks/useCart';
import StoreImage from '../StoreImage';

// "¿Tienes un cupón?": colapsado hasta que el cliente lo abre; con un cupón
// aplicado muestra el código y "Quitar".
const CouponField = ({ coupon }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (coupon.applied) {
    return (
      <div className="co-coupon co-coupon--applied">
        <p>
          <i className="fa-solid fa-ticket" aria-hidden="true" />
          <span>
            Cupón <strong>{coupon.applied.code}</strong>
            <small>{coupon.applied.message}</small>
          </span>
        </p>
        <button type="button" className="co-coupon-remove" onClick={() => coupon.remove()}>
          Quitar
        </button>
      </div>
    );
  }

  return (
    <div className="co-coupon">
      {isOpen || coupon.error ? (
        <form className="co-coupon-form" onSubmit={coupon.apply}>
          <label htmlFor="co-coupon-input" className="co-coupon-label">
            Código de cupón
          </label>
          <div className="co-coupon-row">
            <input
              id="co-coupon-input"
              type="text"
              value={coupon.input}
              onChange={(e) => coupon.setInput(e.target.value)}
              placeholder="Escribe tu código"
              maxLength={30}
              autoComplete="off"
              autoCapitalize="characters"
              aria-invalid={coupon.error ? 'true' : undefined}
              aria-describedby={coupon.error ? 'co-coupon-error' : undefined}
            />
            <button type="submit" className="co-btn co-coupon-apply" disabled={coupon.isChecking || !coupon.input.trim()}>
              {coupon.isChecking ? 'Revisando…' : 'Aplicar'}
            </button>
          </div>
          {coupon.error ? (
            <p id="co-coupon-error" className="co-coupon-error" role="alert">
              {coupon.error}
            </p>
          ) : null}
        </form>
      ) : (
        <button type="button" className="co-coupon-toggle" onClick={() => setIsOpen(true)}>
          <i className="fa-solid fa-ticket" aria-hidden="true" /> ¿Tienes un cupón?
        </button>
      )}
    </div>
  );
};

const PRIMARY_LABELS = ['Continuar con la entrega', 'Continuar con tus datos', 'Continuar al pago', 'Confirmar pedido'];

const CheckoutSummary = ({ co }) => {
  const { cart, step, shipping, total, deliveryMethod, coupon, itemsTotal } = co;
  const { lines, count, subtotal, savings, regularSubtotal, shippingEnabled, freeShippingFrom } = cart;

  // Envío: con la entrega elegida, el de esa entrega; antes de elegir, el
  // costo fijo del envío a domicilio (o gratis si la tienda solo entrega en
  // punto de venta), ya sumado al total.
  const estimatedShipping = shipping !== null ? shipping : co.options.homeDeliveryEnabled ? co.homeShipping : 0;
  const shownTotal = shipping !== null ? total : itemsTotal + estimatedShipping;
  const shippingText = estimatedShipping === 0 ? 'Gratis' : formatMxn(estimatedShipping);
  const showPickupHint = shipping === null && estimatedShipping > 0 && co.hasPickup;

  // La meta se mide contra el subtotal ya con el cupón (como en el backend);
  // con un cupón de envío gratis ya no hace falta.
  const showGoal = shippingEnabled && freeShippingFrom && deliveryMethod !== 'pickup' && !coupon.freeShipping;
  const missing = showGoal ? Math.max(0, freeShippingFrom - itemsTotal) : 0;
  const progress = showGoal ? Math.min(100, Math.round((itemsTotal / freeShippingFrom) * 100)) : 0;
  const totalSavings = savings + coupon.discount;
  const isLast = step === PRIMARY_LABELS.length - 1;

  return (
    <aside className="co-summary" aria-labelledby="co-summary-title">
      <h2 id="co-summary-title" className="co-summary-title">
        Resumen <span>({count} {count === 1 ? 'producto' : 'productos'})</span>
      </h2>

      {step > 0 ? (
        <ul className="co-summary-lines">
          {lines.map((line) => (
            <li key={line.key}>
              <span className="co-summary-thumb">
                <StoreImage src={line.image} alt="" label="Producto" className="co-summary-img" />
                <span className="co-summary-qty">{line.qty}</span>
              </span>
              <span className="co-summary-name">
                {line.name}
                {formatOptions(line.options) ? <small>{formatOptions(line.options)}</small> : null}
              </span>
              <span className="co-summary-price">{formatMxn(line.price * line.qty)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="co-summary-rows">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMxn(savings ? regularSubtotal : subtotal)}</dd>
        </div>
        {savings ? (
          <div className="co-summary-discount">
            <dt>Descuentos</dt>
            <dd>−{formatMxn(savings)}</dd>
          </div>
        ) : null}
        {coupon.discount ? (
          <div className="co-summary-discount">
            <dt>Cupón {coupon.applied.code}</dt>
            <dd>−{formatMxn(coupon.discount)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{shipping === null && co.options.homeDeliveryEnabled ? 'Envío a domicilio' : 'Envío'}</dt>
          <dd>
            {shippingText}
            {showPickupHint ? <small>Gratis si recoges en un punto de venta</small> : null}
          </dd>
        </div>
        <div className="co-summary-total">
          <dt>Total</dt>
          <dd>{formatMxn(shownTotal)}</dd>
        </div>
      </dl>

      <CouponField coupon={coupon} />

      {totalSavings ? (
        <p className="co-summary-savings">
          <i className="fa-solid fa-tag" aria-hidden="true" />
          <span>
            ¡Ahorras <strong>{formatMxn(totalSavings)}</strong> en este pedido!
          </span>
        </p>
      ) : null}

      {showGoal ? (
        <div className="co-summary-goal">
          <p>
            {missing > 0 ? (
              <span>
                Agrega <strong>{formatMxn(missing)}</strong> y tu envío es gratis
              </span>
            ) : (
              <strong>¡Tu envío es gratis!</strong>
            )}
          </p>
          <span className="co-bar" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        </div>
      ) : null}

      {co.stepError ? (
        <p className="co-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{co.stepError}</span>
        </p>
      ) : null}

      <button
        type="button"
        className="co-btn co-btn--solid co-summary-cta"
        onClick={isLast ? co.submitOrder : co.goNext}
        disabled={co.isSubmitting}
      >
        {co.isSubmitting ? 'Enviando tu pedido…' : PRIMARY_LABELS[step]}
      </button>

      <p className="co-summary-note">
        <i className="fa-solid fa-lock" aria-hidden="true" />
        <span>Tu pedido queda apartado; confirmamos el pago contigo antes de enviarlo.</span>
      </p>
    </aside>
  );
};

export default CheckoutSummary;
