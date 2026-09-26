// src/components/checkout/StepPayment.jsx — paso 4: método de pago (los que
// aplican a la entrega elegida, configurables en el admin), revisión de
// entrega y datos, y notas. El botón "Confirmar pedido" está en el resumen.
import React from 'react';
import { Link } from 'react-router-dom';

const PAYMENT_ICONS = { spei: 'fa-solid fa-building-columns', manual: 'fa-solid fa-money-bill-wave' };

const StepPayment = ({ co }) => {
  const { deliveryMethod, pickupPoint, shippingAddress: a, contact } = co;

  return (
    <section className="co-panel" aria-labelledby="co-step-title">
      <div className="co-panel-head">
        <h2 id="co-step-title">¿Cómo quieres pagar?</h2>
      </div>

      {co.availablePaymentMethods.length ? (
        <div className="co-options">
          {co.availablePaymentMethods.map((method) => {
            const selected = co.paymentMethod?._id === method._id;
            return (
              <label key={method._id} className={`co-option${selected ? ' is-selected' : ''}`}>
                <input type="radio" name="payment" checked={selected} onChange={() => co.setPaymentMethodId(method._id)} />
                <span className="co-option-icon" aria-hidden="true">
                  <i className={PAYMENT_ICONS[method.type] || 'fa-solid fa-wallet'} />
                </span>
                <span className="co-option-body">
                  <strong>{method.label}</strong>
                  {method.description ? <span>{method.description}</span> : null}
                  {selected && method.type === 'spei' ? (
                    <span className="co-option-detail">Al confirmar te enviamos por correo los datos para la transferencia.</span>
                  ) : null}
                  {selected && method.type !== 'spei' && method.instructions ? (
                    <span className="co-option-detail">{method.instructions}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="co-empty-note">No hay métodos de pago disponibles para esta forma de entrega. Elige otra o contáctanos.</p>
      )}

      <h3 className="co-subtitle">Revisa tu pedido</h3>
      <div className="co-review">
        <div>
          <h4>
            Entrega
            <button type="button" className="co-link" onClick={() => co.goToStep(1)}>
              Cambiar
            </button>
          </h4>
          {deliveryMethod === 'pickup' ? (
            <p>
              <span>
                Recoger en <strong>{pickupPoint?.name || 'tienda'}</strong>
              </span>
              {pickupPoint?.address ? <span>{pickupPoint.address}</span> : null}
              {pickupPoint?.schedule ? <span>Horario: {pickupPoint.schedule}</span> : null}
            </p>
          ) : (
            <p>
              <strong>Envío a domicilio</strong>
              <span>
                {a.street} {a.exteriorNumber}
                {a.interiorNumber ? `, int. ${a.interiorNumber}` : ''}, {a.neighborhood}
              </span>
              <span>
                {a.city}, {a.state} · C.P. {a.zipCode}
              </span>
              <span>
                Recibe: {a.recipientName} · {a.phone}
              </span>
            </p>
          )}
        </div>
        <div>
          <h4>
            Tus datos
            <button type="button" className="co-link" onClick={() => co.goToStep(2)}>
              Cambiar
            </button>
          </h4>
          <p>
            <strong>{contact.customerName}</strong>
            <span>{contact.customerEmail}</span>
            <span>{contact.customerPhone}</span>
          </p>
        </div>
      </div>

      <label className="co-field co-notes" htmlFor="co-notes">
        <span>Notas para tu pedido (opcional)</span>
        <textarea
          id="co-notes"
          rows={3}
          maxLength={500}
          value={co.notes}
          onChange={(e) => co.setNotes(e.target.value)}
          placeholder="¿Algo que debamos saber? Ej. molienda, horario para recibir, es un regalo…"
        />
      </label>

      <p className="co-muted co-legal">
        Al confirmar aceptas nuestro <Link to="/privacy-policy">Aviso de privacidad</Link>.
      </p>
    </section>
  );
};

export default StepPayment;
