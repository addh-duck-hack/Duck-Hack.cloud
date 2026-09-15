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
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../utils/apiClient';
import { iconForCategory } from './BrandMarks';
import CheckoutAccountStep from './CheckoutAccountStep';
import './Cart.css';

const STEPS = ['Tu canasta', 'Tu cuenta', 'Datos de envío', '¡Gracias!'];

const PAYMENT_NOTES = {
  transfer: 'Te contactamos con los datos para la transferencia; tu pedido queda apartado como pendiente de pago.',
  pickup: 'Puedes pasar a recoger y pagar en la finca; te escribimos para coordinar.',
};

// Mismos campos que Order.shippingAddress (packages/core-api/modules/orders.js)
// y User.addresses (modules/auth.js) — una dirección guardada se copia tal
// cual a este bloque, ver pickShippingAddress más abajo.
const INITIAL_SHIPPING_ADDRESS = {
  recipientName: '',
  phone: '',
  street: '',
  exteriorNumber: '',
  interiorNumber: '',
  zipCode: '',
  neighborhood: '',
  city: '',
  state: '',
};

const INITIAL_FORM = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  shippingAddress: INITIAL_SHIPPING_ADDRESS,
};

// Extrae solo los campos de dirección de un objeto más grande (una entrada
// de User.addresses trae también _id/label/isDefault/etc., que no aplican
// al pedido) — usado tanto para la sesión ya iniciada (goToAccountOrSkip)
// como para el login/registro dentro del checkout (handleAccountContinue).
const pickShippingAddress = (addr) => {
  if (!addr) return null;
  const picked = {};
  Object.keys(INITIAL_SHIPPING_ADDRESS).forEach((field) => {
    picked[field] = addr[field] || '';
  });
  return picked;
};

// Los 8 campos de dirección — usados tanto por invitados (siempre) como por
// un usuario registrado agregando una dirección nueva durante el checkout
// (ver AddressStep más abajo). `required` se apaga para "pago en finca"
// (dirección opcional), igual que antes de este cambio.
const ShippingAddressFields = ({ values, onChange, required }) => (
  <div className="ship-address-grid">
    <div className="field">
      <label htmlFor="a-recipientName">Nombre de quien recibe</label>
      <input
        id="a-recipientName"
        name="recipientName"
        value={values.recipientName}
        onChange={onChange}
        required={required}
        placeholder="María Fernanda Ruiz"
      />
    </div>
    <div className="field">
      <label htmlFor="a-phone">Teléfono</label>
      <input
        id="a-phone"
        name="phone"
        value={values.phone}
        onChange={onChange}
        required={required}
        placeholder="55 1234 5678"
      />
    </div>
    <div className="field field-wide">
      <label htmlFor="a-street">Calle</label>
      <input
        id="a-street"
        name="street"
        value={values.street}
        onChange={onChange}
        required={required}
        placeholder="Av. Reforma"
      />
    </div>
    <div className="field">
      <label htmlFor="a-exteriorNumber">Número exterior</label>
      <input
        id="a-exteriorNumber"
        name="exteriorNumber"
        value={values.exteriorNumber}
        onChange={onChange}
        required={required}
        placeholder="123"
      />
    </div>
    <div className="field">
      <label htmlFor="a-interiorNumber">Número interior (opcional)</label>
      <input
        id="a-interiorNumber"
        name="interiorNumber"
        value={values.interiorNumber}
        onChange={onChange}
        placeholder="Depto. 4"
      />
    </div>
    <div className="field">
      <label htmlFor="a-zipCode">Código postal</label>
      <input
        id="a-zipCode"
        name="zipCode"
        value={values.zipCode}
        onChange={onChange}
        required={required}
        placeholder="73080"
      />
    </div>
    <div className="field">
      <label htmlFor="a-neighborhood">Colonia</label>
      <input
        id="a-neighborhood"
        name="neighborhood"
        value={values.neighborhood}
        onChange={onChange}
        required={required}
        placeholder="Centro"
      />
    </div>
    <div className="field">
      <label htmlFor="a-city">Ciudad</label>
      <input
        id="a-city"
        name="city"
        value={values.city}
        onChange={onChange}
        required={required}
        placeholder="Xicotepec de Juárez"
      />
    </div>
    <div className="field">
      <label htmlFor="a-state">Estado</label>
      <input
        id="a-state"
        name="state"
        value={values.state}
        onChange={onChange}
        required={required}
        placeholder="Puebla"
      />
    </div>
  </div>
);

// Sección "Dirección de envío" del paso 2 — para un invitado siempre es el
// formulario directo (nunca tuvo libreta de direcciones). Para un usuario
// registrado, según el estado que arma syncAddressesFromUser en Cart:
//   - sin direcciones y sin estar agregando una → botón "Agregar dirección"
//     (requisito 1, en vez del formulario directo).
//   - agregando una nueva (showNewAddressForm) → el mismo formulario, con
//     botón "Guardar dirección" que la manda a la libreta (no solo al pedido).
//   - con direcciones guardadas → listado seleccionable; la predeterminada
//     llega preseleccionada (requisito 2) y si ninguna es default el radio
//     `required` obliga a elegir una antes de poder enviar (requisito 3).
const AddressStep = ({
  auth,
  paymentMethod,
  form,
  onAddressFieldChange,
  addresses,
  selectedAddressId,
  onSelectAddress,
  showNewAddressForm,
  onShowNewAddressForm,
  onCancelNewAddressForm,
  onSaveNewAddress,
  isSavingNewAddress,
  newAddressError,
}) => {
  const required = paymentMethod === 'transfer';

  if (!auth.isAuthenticated) {
    return <ShippingAddressFields values={form.shippingAddress} onChange={onAddressFieldChange} required={required} />;
  }

  if (addresses.length === 0 && !showNewAddressForm) {
    return (
      <button type="button" className="btn btn-solid" onClick={onShowNewAddressForm}>
        Agregar dirección
      </button>
    );
  }

  if (showNewAddressForm) {
    return (
      <>
        <ShippingAddressFields values={form.shippingAddress} onChange={onAddressFieldChange} required={required} />
        {newAddressError ? <div className="checkout-error">{newAddressError}</div> : null}
        <div className="ship-address-form-actions">
          <button type="button" className="btn btn-solid" onClick={onSaveNewAddress} disabled={isSavingNewAddress}>
            {isSavingNewAddress ? 'Guardando…' : 'Guardar dirección'}
          </button>
          {addresses.length > 0 && (
            <button type="button" className="btn" onClick={onCancelNewAddressForm} disabled={isSavingNewAddress}>
              Cancelar
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="ship-address-list">
      {addresses.map((a) => (
        <label
          key={a._id}
          className={`ship-address-option${selectedAddressId === a._id ? ' selected' : ''}`}
        >
          <input
            type="radio"
            name="savedShippingAddress"
            checked={selectedAddressId === a._id}
            onChange={() => onSelectAddress(a)}
            required={required}
          />
          <span className="ship-address-option-body">
            {a.isDefault ? <span className="ship-address-default-badge">Predeterminada</span> : null}
            {a.label ? <strong>{a.label}</strong> : null}
            <span>{a.recipientName} · {a.phone}</span>
            <span>
              {a.street} {a.exteriorNumber}
              {a.interiorNumber ? `, Int. ${a.interiorNumber}` : ''}
            </span>
            <span>{a.neighborhood}, {a.city}, {a.state} · C.P. {a.zipCode}</span>
          </span>
        </label>
      ))}
      <button type="button" className="btn ship-add-address-btn" onClick={onShowNewAddressForm}>
        + Agregar otra dirección
      </button>
    </div>
  );
};

const Cart = () => {
  usePageMeta('Canasta');
  const navigate = useNavigate();
  const { lines, subtotal, shipping, total, count, freeShippingFrom, setQty, removeItem, clear, submitOrder } = useCart();
  // Sesión del cliente (useAuth.jsx) — solo se usa para precargar
  // nombre/correo/teléfono y mostrar "¿no eres tú?"; el pedido siempre va
  // por POST /api/orders/public, que decide por su cuenta si lo vincula
  // (ver useCart.jsx#submitOrder / attachOptionalCustomer en orders.js).
  const auth = useAuth();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [order, setOrder] = useState(null);

  // Libreta de direcciones del cliente (solo aplica con sesión iniciada) —
  // ver AddressStep más abajo. `selectedAddressId` vacío significa "ninguna
  // elegida todavía" (fuerza selección cuando no hay predeterminada, ver
  // syncAddressesFromUser); `showNewAddressForm` alterna entre el
  // listado/botón y el formulario de dirección nueva.
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [isSavingNewAddress, setIsSavingNewAddress] = useState(false);
  const [newAddressError, setNewAddressError] = useState('');

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddressFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, shippingAddress: { ...prev.shippingAddress, [name]: value } }));
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
      setStep(3);
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
    setAddresses([]);
    setSelectedAddressId('');
    setShowNewAddressForm(false);
    setStep(0);
    navigate('/tienda');
  };

  // Refleja la libreta de direcciones de `user` en el estado local del
  // checkout: con predeterminada → se preselecciona (requisito 2); con
  // direcciones pero sin predeterminada → ninguna queda marcada, así el
  // radio `required` de abajo obliga a elegir una (requisito 3); sin
  // direcciones → arranca en "botón de agregar", no en el formulario
  // directo (requisito 1, ver AddressStep más abajo).
  const syncAddressesFromUser = (user) => {
    const list = user?.addresses || [];
    setAddresses(list);
    setShowNewAddressForm(false);
    const defaultAddress = list.find((a) => a.isDefault);
    if (defaultAddress) {
      setSelectedAddressId(defaultAddress._id);
      setForm((prev) => ({ ...prev, shippingAddress: pickShippingAddress(defaultAddress) || prev.shippingAddress }));
    } else {
      setSelectedAddressId('');
    }
  };

  const handleSelectSavedAddress = (address) => {
    setSelectedAddressId(address._id);
    setForm((prev) => ({ ...prev, shippingAddress: pickShippingAddress(address) || prev.shippingAddress }));
  };

  // Guarda la dirección nueva en la libreta del cliente (no solo en el
  // pedido) — a diferencia del checkbox que había antes, aquí es siempre así
  // para un usuario registrado: el punto es que la próxima vez ya aparezca
  // en el listado (requisito 1).
  const handleSaveNewAddressDuringCheckout = async () => {
    setNewAddressError('');
    setIsSavingNewAddress(true);
    try {
      const data = await apiFetch(`/api/users/${auth.user._id}/addresses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form.shippingAddress),
      });
      const updatedAddresses = data.user?.addresses || [];
      setAddresses(updatedAddresses);
      // El backend hace push al final del arreglo — la recién creada es la
      // última (ver POST /:id/addresses en packages/core-api/modules/auth.js).
      const newAddress = updatedAddresses[updatedAddresses.length - 1];
      if (newAddress) {
        setSelectedAddressId(newAddress._id);
        setForm((prev) => ({ ...prev, shippingAddress: pickShippingAddress(newAddress) || prev.shippingAddress }));
      }
      setShowNewAddressForm(false);
    } catch (err) {
      setNewAddressError(err.message || 'No fue posible guardar la dirección.');
    } finally {
      setIsSavingNewAddress(false);
    }
  };

  // Si ya hay sesión (useAuth.jsx), nos saltamos el paso "Tu cuenta" y
  // precargamos el formulario de envío.
  const goToAccountOrSkip = () => {
    if (auth.isAuthenticated) {
      setForm((prev) => ({
        ...prev,
        customerName: auth.user.name || prev.customerName,
        customerEmail: auth.user.email || prev.customerEmail,
        customerPhone: auth.user.phone || prev.customerPhone,
      }));
      syncAddressesFromUser(auth.user);
      setStep(2);
    } else {
      setStep(1);
    }
    window.scrollTo(0, 0);
  };

  const handleAccountContinue = ({ customerName, customerEmail, customerPhone, user }) => {
    setForm((prev) => ({
      ...prev,
      customerName: customerName || prev.customerName,
      customerEmail: customerEmail || prev.customerEmail,
      customerPhone: customerPhone || prev.customerPhone,
    }));
    if (user) {
      // Login exitoso durante el checkout — usamos `user` tal cual lo
      // regresa el login en vez de auth.user (el estado del contexto puede
      // no estar actualizado todavía justo después de auth.login()).
      syncAddressesFromUser(user);
    } else {
      // Registro recién hecho (pendiente de verificar correo, sin sesión
      // todavía) — no hay libreta de direcciones, se comporta como invitado.
      setAddresses([]);
      setSelectedAddressId('');
      setShowNewAddressForm(false);
    }
    setStep(2);
    window.scrollTo(0, 0);
  };

  const handleForgetAccount = () => {
    auth.logout();
    setAddresses([]);
    setSelectedAddressId('');
    setShowNewAddressForm(false);
    setStep(1);
    window.scrollTo(0, 0);
  };

  const renderOrderSummary = () => (
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
  );

  const eyebrow = ['Tu canasta', 'Antes de pagar', 'Casi listo', 'Recibido'][step];

  if (lines.length === 0 && step < 3) {
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
            <button className="btn btn-solid block" onClick={goToAccountOrSkip}>
              Continuar al pago
            </button>
            <Link className="cart-cont" to="/tienda">← Seguir viendo la carta</Link>
          </aside>
        </div>
      )}

      {step === 1 && (
        <div className="cart-grid">
          <CheckoutAccountStep
            onGuest={() => { setStep(2); window.scrollTo(0, 0); }}
            onContinue={handleAccountContinue}
            onBack={() => { setStep(0); window.scrollTo(0, 0); }}
          />
          {renderOrderSummary()}
        </div>
      )}

      {step === 2 && (
        <div className="cart-grid">
          <form className="ship-form" onSubmit={handleSubmitShipping}>
            {submitError ? <div className="checkout-error">{submitError}</div> : null}

            {auth.isAuthenticated && (
              <div className="account-note">
                Continuando como <strong>{auth.user.name || auth.user.email}</strong> ·{' '}
                <button type="button" className="as-link" onClick={handleForgetAccount}>¿No eres tú?</button>
              </div>
            )}

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
              <label>
                {paymentMethod === 'transfer' ? 'Dirección de envío' : 'Dirección de envío (opcional)'}
              </label>
            </div>
            <AddressStep
              auth={auth}
              paymentMethod={paymentMethod}
              form={form}
              onAddressFieldChange={handleAddressFieldChange}
              addresses={addresses}
              selectedAddressId={selectedAddressId}
              onSelectAddress={handleSelectSavedAddress}
              showNewAddressForm={showNewAddressForm}
              onShowNewAddressForm={() => setShowNewAddressForm(true)}
              onCancelNewAddressForm={() => {
                setShowNewAddressForm(false);
                setNewAddressError('');
              }}
              onSaveNewAddress={handleSaveNewAddressDuringCheckout}
              isSavingNewAddress={isSavingNewAddress}
              newAddressError={newAddressError}
            />

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

          {renderOrderSummary()}
        </div>
      )}

      {step === 3 && order && (
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
