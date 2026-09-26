// src/components/checkout/StepDetails.jsx — paso 3: datos de contacto y
// dirección. Con sesión: la cuenta + su libreta de direcciones. Sin sesión:
// comprar como invitado (default), iniciar sesión o crear cuenta.
import React from 'react';
import { Link } from 'react-router-dom';
import { useCheckoutAccount } from '../../hooks/useCheckout';
import AddressFields from './AddressFields';

const addressLine = (a) =>
  [
    `${a.street} ${a.exteriorNumber}${a.interiorNumber ? `, int. ${a.interiorNumber}` : ''}`,
    a.neighborhood,
    `${a.city}, ${a.state}`,
    a.zipCode ? `C.P. ${a.zipCode}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

const ContactFields = ({ co, emailReadOnly }) => (
  <div className="co-grid">
    <label className="co-field" htmlFor="co-name">
      <span>Nombre completo</span>
      <input id="co-name" name="customerName" value={co.contact.customerName} onChange={co.onContactChange} autoComplete="name" required />
    </label>
    <label className="co-field" htmlFor="co-phone">
      <span>Teléfono (10 dígitos)</span>
      <input
        id="co-phone"
        name="customerPhone"
        type="tel"
        inputMode="numeric"
        value={co.contact.customerPhone}
        onChange={co.onContactChange}
        autoComplete="tel"
        placeholder="55 1234 5678"
        required
      />
    </label>
    <label className="co-field co-field--wide" htmlFor="co-email">
      <span>Correo electrónico</span>
      <input
        id="co-email"
        name="customerEmail"
        type="email"
        value={co.contact.customerEmail}
        onChange={co.onContactChange}
        autoComplete="email"
        readOnly={emailReadOnly}
        required
      />
    </label>
  </div>
);

const AccountAddresses = ({ co }) => {
  if (co.isLoadingAddresses) return <p className="co-muted">Cargando tus direcciones…</p>;
  return (
    <>
      {co.addresses.length ? (
        <div className="co-options">
          {co.addresses.map((address) => {
            const selected = !co.showNewAddressForm && co.selectedAddressId === address._id;
            return (
              <label key={address._id} className={`co-option${selected ? ' is-selected' : ''}`}>
                <input type="radio" name="address" checked={selected} onChange={() => co.selectSavedAddress(address)} />
                <span className="co-option-icon" aria-hidden="true">
                  <i className="fa-solid fa-house" />
                </span>
                <span className="co-option-body">
                  <strong>
                    {address.label || address.recipientName}
                    {address.isDefault ? <em className="co-tag">Predeterminada</em> : null}
                  </strong>
                  <span>{addressLine(address)}</span>
                  <span className="co-option-detail">
                    Recibe: {address.recipientName} · {address.phone}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {co.showNewAddressForm ? (
        <div className="co-subpanel">
          <h4>Nueva dirección</h4>
          <AddressFields value={co.shippingAddress} onChange={co.onAddressFieldChange} idPrefix="co-new" />
          {co.newAddressError ? (
            <p className="co-error" role="alert">
              <span>{co.newAddressError}</span>
            </p>
          ) : null}
          <div className="co-actions">
            <button type="button" className="co-btn co-btn--solid" onClick={co.saveNewAddress} disabled={co.isSavingNewAddress}>
              {co.isSavingNewAddress ? 'Guardando…' : 'Guardar dirección'}
            </button>
            {co.addresses.length ? (
              <button type="button" className="co-btn" onClick={co.cancelNewAddressForm}>
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button type="button" className="co-link co-add" onClick={co.openNewAddressForm}>
          <i className="fas fa-plus" aria-hidden="true" /> Agregar otra dirección
        </button>
      )}
    </>
  );
};

const LoginForm = ({ login }) => (
  <form className="co-subpanel" onSubmit={login.onSubmit}>
    <div className="co-grid">
      <label className="co-field co-field--wide" htmlFor="co-login-email">
        <span>Correo electrónico</span>
        <input id="co-login-email" name="email" type="email" value={login.form.email} onChange={login.onChange} autoComplete="email" required />
      </label>
      <label className="co-field co-field--wide" htmlFor="co-login-password">
        <span>Contraseña</span>
        <input
          id="co-login-password"
          name="password"
          type="password"
          value={login.form.password}
          onChange={login.onChange}
          autoComplete="current-password"
          required
        />
      </label>
    </div>
    {login.error ? (
      <p className="co-error" role="alert">
        <span>{login.error}</span>
      </p>
    ) : null}
    <div className="co-actions">
      <button type="submit" className="co-btn co-btn--solid" disabled={login.isSubmitting}>
        {login.isSubmitting ? 'Entrando…' : 'Iniciar sesión'}
      </button>
      <Link to="/recuperar-contrasena" className="co-link">
        ¿Olvidaste tu contraseña?
      </Link>
    </div>
  </form>
);

const RegisterForm = ({ register }) => (
  <form className="co-subpanel" onSubmit={register.onSubmit}>
    <p className="co-muted">Crea tu cuenta para guardar tus direcciones y ver tus pedidos. Tu compra sigue en seguida.</p>
    <div className="co-grid">
      <label className="co-field" htmlFor="co-reg-name">
        <span>Nombre completo</span>
        <input id="co-reg-name" name="name" value={register.form.name} onChange={register.onChange} autoComplete="name" required />
      </label>
      <label className="co-field" htmlFor="co-reg-phone">
        <span>Teléfono</span>
        <input id="co-reg-phone" name="phone" type="tel" inputMode="numeric" value={register.form.phone} onChange={register.onChange} autoComplete="tel" />
      </label>
      <label className="co-field co-field--wide" htmlFor="co-reg-email">
        <span>Correo electrónico</span>
        <input id="co-reg-email" name="email" type="email" value={register.form.email} onChange={register.onChange} autoComplete="email" required />
      </label>
      <label className="co-field co-field--wide" htmlFor="co-reg-password">
        <span>Contraseña</span>
        <input
          id="co-reg-password"
          name="password"
          type="password"
          value={register.form.password}
          onChange={register.onChange}
          autoComplete="new-password"
          minLength={6}
          required
        />
      </label>
    </div>
    {register.error ? (
      <p className="co-error" role="alert">
        <span>{register.error}</span>
      </p>
    ) : null}
    <div className="co-actions">
      <button type="submit" className="co-btn co-btn--solid" disabled={register.isSubmitting}>
        {register.isSubmitting ? 'Creando tu cuenta…' : 'Crear cuenta y continuar'}
      </button>
    </div>
  </form>
);

const ACCOUNT_TABS = [
  { id: 'guest', label: 'Comprar como invitado' },
  { id: 'login', label: 'Iniciar sesión' },
  { id: 'register', label: 'Crear cuenta' },
];

const GuestDetails = ({ co }) => {
  const account = useCheckoutAccount({ onRegistered: co.prefillContact });

  return (
    <>
      <div className="co-tabs" role="tablist" aria-label="Cómo quieres continuar">
        {ACCOUNT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={account.mode === tab.id}
            className={`co-tab${account.mode === tab.id ? ' is-active' : ''}`}
            onClick={() => account.setMode(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {account.mode === 'login' ? <LoginForm login={account.login} /> : null}
      {account.mode === 'register' ? <RegisterForm register={account.register} /> : null}

      {account.mode === 'guest' ? (
        <>
          {account.registeredEmail ? (
            <p className="co-success" role="status">
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              <span>
                ¡Listo! Creamos tu cuenta y te enviamos un correo a <strong>{account.registeredEmail}</strong> para
                verificarla. Termina tu compra aquí; tu pedido aparecerá en tu cuenta al verificarla.
              </span>
            </p>
          ) : null}
          <h3 className="co-subtitle">Datos de contacto</h3>
          <ContactFields co={co} />
          {co.deliveryMethod === 'shipping' ? (
            <>
              <h3 className="co-subtitle">Dirección de entrega</h3>
              <AddressFields value={co.shippingAddress} onChange={co.onAddressFieldChange} idPrefix="co-guest" />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
};

const StepDetails = ({ co }) => {
  const { auth } = co;

  return (
    <section className="co-panel" aria-labelledby="co-step-title">
      <div className="co-panel-head">
        <h2 id="co-step-title">Tus datos</h2>
      </div>

      {auth.isAuthenticated ? (
        <>
          <div className="co-account">
            <span className="co-account-icon" aria-hidden="true">
              <i className="fa-solid fa-user" />
            </span>
            <span>
              <span>
                Compras como <strong>{auth.user.name || auth.user.email}</strong>
              </span>
              <small>{auth.user.email}</small>
            </span>
            <button type="button" className="co-link" onClick={co.forgetAccount}>
              ¿No eres tú? Cerrar sesión
            </button>
          </div>
          <h3 className="co-subtitle">Datos de contacto</h3>
          <ContactFields co={co} emailReadOnly />
          {co.deliveryMethod === 'shipping' ? (
            <>
              <h3 className="co-subtitle">Dirección de entrega</h3>
              <AccountAddresses co={co} />
            </>
          ) : null}
        </>
      ) : (
        <GuestDetails co={co} />
      )}

      {co.deliveryMethod === 'pickup' && co.pickupPoint ? (
        <p className="co-muted co-pickup-note">
          <i className="fa-solid fa-store" aria-hidden="true" /> Recogerás tu pedido en <strong>{co.pickupPoint.name}</strong>; no
          necesitamos tu dirección.
        </p>
      ) : null}
    </section>
  );
};

export default StepDetails;
