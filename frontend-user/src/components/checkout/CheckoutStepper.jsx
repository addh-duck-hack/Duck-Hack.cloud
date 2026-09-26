// src/components/checkout/CheckoutStepper.jsx
//
// Pasos del checkout (1 Canasta · 2 Entrega · 3 Tus datos · 4 Pago). Los
// pasos anteriores son botones para regresar; los siguientes, también, pero
// useCheckout().goToStep solo avanza si los de en medio están completos.
import React from 'react';

const CheckoutStepper = ({ steps, current, onStep }) => (
  <nav className="co-stepper" aria-label="Pasos de la compra">
    <ol>
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'next';
        return (
          <li key={label} className={`co-step is-${state}`}>
            <button
              type="button"
              onClick={() => onStep(index)}
              aria-current={state === 'current' ? 'step' : undefined}
              disabled={state === 'current'}
            >
              <span className="co-step-num" aria-hidden="true">
                {state === 'done' ? <i className="fas fa-check" /> : index + 1}
              </span>
              <span className="co-step-label">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
);

export default CheckoutStepper;
