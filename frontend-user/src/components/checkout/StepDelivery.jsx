// src/components/checkout/StepDelivery.jsx — paso 2: envío a domicilio o
// recoger en un punto de venta (opciones del admin, "Entrega y pago").
import React from 'react';
import { formatMxn } from '../../hooks/useCart';
import { mapsHref } from '../../hooks/useCheckout';

const shippingNote = (cart) => {
  if (!cart.shippingEnabled) return 'Gratis';
  if (cart.shipping === 0) return 'Gratis en este pedido';
  return cart.freeShippingFrom
    ? `${formatMxn(cart.shippingCost)} · gratis desde ${formatMxn(cart.freeShippingFrom)}`
    : formatMxn(cart.shippingCost);
};

const StepDelivery = ({ co }) => {
  const { options, deliveryMethod, pickupPoint, cart } = co;

  return (
    <section className="co-panel" aria-labelledby="co-step-title">
      <div className="co-panel-head">
        <h2 id="co-step-title">¿Cómo quieres recibir tu pedido?</h2>
      </div>

      {!co.hasDeliveryOption ? (
        <p className="co-empty-note">Por ahora no hay formas de entrega disponibles. Contáctanos para completar tu pedido.</p>
      ) : null}

      <div className="co-options">
        {options.homeDeliveryEnabled ? (
          <label className={`co-option${deliveryMethod === 'shipping' ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="delivery"
              checked={deliveryMethod === 'shipping'}
              onChange={co.chooseShipping}
            />
            <span className="co-option-icon" aria-hidden="true">
              <i className="fa-solid fa-truck-fast" />
            </span>
            <span className="co-option-body">
              <strong>Envío a domicilio</strong>
              <span>Lo llevamos a la dirección que elijas.</span>
            </span>
            <span className="co-option-meta">{shippingNote(cart)}</span>
          </label>
        ) : null}

        {co.hasPickup ? (
          <fieldset className="co-option-group">
            <legend>
              <i className="fa-solid fa-store" aria-hidden="true" /> Recoger en punto de venta <span>· Gratis</span>
            </legend>
            {options.pickupPoints.map((point) => {
              const selected = deliveryMethod === 'pickup' && pickupPoint?._id === point._id;
              const href = mapsHref(point);
              return (
                <label key={point._id} className={`co-option${selected ? ' is-selected' : ''}`}>
                  <input type="radio" name="delivery" checked={selected} onChange={() => co.choosePickupPoint(point._id)} />
                  <span className="co-option-icon" aria-hidden="true">
                    <i className="fa-solid fa-location-dot" />
                  </span>
                  <span className="co-option-body">
                    <strong>{point.name}</strong>
                    {point.address ? <span>{point.address}</span> : null}
                    {point.schedule ? (
                      <span className="co-option-detail">
                        <i className="fa-regular fa-clock" aria-hidden="true" /> {point.schedule}
                      </span>
                    ) : null}
                    {selected && point.instructions ? <span className="co-option-detail">{point.instructions}</span> : null}
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="co-link co-option-map">
                        Ver en el mapa <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                      </a>
                    ) : null}
                  </span>
                  <span className="co-option-meta">Gratis</span>
                </label>
              );
            })}
          </fieldset>
        ) : null}
      </div>
    </section>
  );
};

export default StepDelivery;
