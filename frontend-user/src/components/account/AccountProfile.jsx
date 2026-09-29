// src/components/account/AccountProfile.jsx — "Mis datos": nombre y teléfono
// (el correo no se puede cambiar: es con el que inicias sesión).
import React from 'react';

const AccountProfile = ({ account }) => {
  const { profile } = account;

  return (
    <div className="acc-section">
      <form className="acc-card" onSubmit={profile.onSubmit}>
        <div className="acc-card-head">
          <h2>Mis datos</h2>
        </div>
        <div className="acc-grid">
          <label className="acc-field" htmlFor="acc-name">
            <span>Nombre completo</span>
            <input id="acc-name" name="name" value={profile.form.name} onChange={profile.onChange} autoComplete="name" minLength={2} maxLength={80} required />
          </label>
          <label className="acc-field" htmlFor="acc-phone">
            <span>Teléfono (10 dígitos)</span>
            <input id="acc-phone" name="phone" type="tel" inputMode="numeric" value={profile.form.phone} onChange={profile.onChange} autoComplete="tel" />
          </label>
          <label className="acc-field acc-field--wide" htmlFor="acc-email">
            <span>Correo electrónico</span>
            <input id="acc-email" value={profile.data?.email || account.user?.email || ''} readOnly />
            <small className="acc-muted">Es con el que inicias sesión; no se puede cambiar.</small>
          </label>
        </div>
        {profile.message ? (
          <p className="acc-alert acc-alert--success" role="status">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>{profile.message}</span>
          </p>
        ) : null}
        {profile.error ? (
          <p className="acc-alert acc-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{profile.error}</span>
          </p>
        ) : null}
        <div className="acc-actions">
          <button type="submit" className="acc-btn" disabled={profile.isSaving}>
            {profile.isSaving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AccountProfile;
