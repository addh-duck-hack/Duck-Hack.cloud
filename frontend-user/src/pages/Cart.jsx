// src/pages/Cart.jsx — ruta /carrito: checkout en 4 pasos (Canasta, Entrega,
// Tus datos, Pago) + confirmación. Toda la lógica vive en useCheckout; cada
// paso es un componente de components/checkout/. El resumen (con el botón de
// cada paso) acompaña a todos los pasos.
import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useCheckout } from '../hooks/useCheckout';
import CartSuggestions from '../components/CartSuggestions';
import CheckoutStepper from '../components/checkout/CheckoutStepper';
import CheckoutSummary from '../components/checkout/CheckoutSummary';
import StepCart from '../components/checkout/StepCart';
import StepDelivery from '../components/checkout/StepDelivery';
import StepDetails from '../components/checkout/StepDetails';
import StepPayment from '../components/checkout/StepPayment';
import CheckoutDone from '../components/checkout/CheckoutDone';
import './Cart.css';

const STEP_COMPONENTS = [StepCart, StepDelivery, StepDetails, StepPayment];

const Cart = () => {
  usePageMeta('Canasta');
  const co = useCheckout();

  if (co.isDone) {
    return (
      <div className="co">
        <CheckoutDone co={co} />
      </div>
    );
  }

  if (co.isCartEmpty) {
    return (
      <div className="co">
        <section className="co-empty">
          <i className="fas fa-basket-shopping" aria-hidden="true" />
          <h1>Tu canasta está vacía</h1>
          <p className="co-muted">Explora nuestros cafés de altura y arma tu pedido.</p>
          <Link to="/tienda" className="co-btn co-btn--solid">
            Ir a la tienda
          </Link>
        </section>
        <CartSuggestions title="Te puede gustar" className="co-suggestions" />
      </div>
    );
  }

  const Step = STEP_COMPONENTS[co.step];

  return (
    <div className="co">
      <header className="co-head">
        <h1 className="co-title">
          Finaliza tu <em>compra</em>
        </h1>
        <CheckoutStepper steps={co.steps} current={co.step} onStep={co.goToStep} />
      </header>

      <div className="co-layout">
        <div className="co-main">
          {co.step > 0 ? (
            <button type="button" className="co-link co-back" onClick={co.goBack}>
              <i className="fas fa-arrow-left" aria-hidden="true" /> Regresar a {co.steps[co.step - 1].toLowerCase()}
            </button>
          ) : null}
          <Step co={co} />
        </div>
        <CheckoutSummary co={co} />
      </div>

      {co.step === 0 ? <CartSuggestions className="co-suggestions" /> : null}
    </div>
  );
};

export default Cart;
