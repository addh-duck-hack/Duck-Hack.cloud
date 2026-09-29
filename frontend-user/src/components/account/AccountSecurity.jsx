// src/components/account/AccountSecurity.jsx — "Seguridad": cambiar la
// contraseña y eliminar la cuenta (derecho de cancelación: el backend la
// anonimiza; los pedidos guardan su propia copia de los datos de contacto).
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PasswordInput } from '../AuthLayout';

const AccountSecurity = ({ account, leave }) => {
  const { password, deleteAccount } = account;
  const [showPasswords, setShowPasswords] = useState(false);

  const confirmDelete = async () => {
    // Eliminada: cierra la sesión y la página lleva al inicio.
    if (await deleteAccount.confirm()) leave(account.logout);
  };

  return (
    <div className="acc-section">
      <form className="acc-card" onSubmit={password.onSubmit}>
        <div className="acc-card-head">
          <h2>Cambiar contraseña</h2>
        </div>
        <div className="acc-grid">
          <label className="acc-field acc-field--wide" htmlFor="acc-current">
            <span className="acc-field-row">
              Contraseña actual
              <Link to="/recuperar-contrasena" className="acc-link">
                ¿La olvidaste?
              </Link>
            </span>
            <PasswordInput
              id="acc-current"
              name="currentPassword"
              value={password.form.currentPassword}
              onChange={password.onChange}
              autoComplete="current-password"
              required
              visible={showPasswords}
              onToggle={() => setShowPasswords((v) => !v)}
            />
          </label>
          <label className="acc-field" htmlFor="acc-new">
            <span>Contraseña nueva</span>
            <input
              id="acc-new"
              name="newPassword"
              type={showPasswords ? 'text' : 'password'}
              value={password.form.newPassword}
              onChange={password.onChange}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <label className="acc-field" htmlFor="acc-confirm">
            <span>Confirma la nueva</span>
            <input
              id="acc-confirm"
              name="confirmPassword"
              type={showPasswords ? 'text' : 'password'}
              value={password.form.confirmPassword}
              onChange={password.onChange}
              autoComplete="new-password"
              required
            />
          </label>
        </div>
        <p className="acc-muted acc-hint">Mínimo 6 caracteres.</p>
        {password.message ? (
          <p className="acc-alert acc-alert--success" role="status">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>{password.message}</span>
          </p>
        ) : null}
        {password.error ? (
          <p className="acc-alert acc-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{password.error}</span>
          </p>
        ) : null}
        <div className="acc-actions">
          <button type="submit" className="acc-btn" disabled={password.isSaving}>
            {password.isSaving ? 'Guardando…' : 'Actualizar contraseña'}
          </button>
        </div>
      </form>

      <div className="acc-card acc-danger">
        <h2>Eliminar mi cuenta</h2>
        <p className="acc-muted">
          Borramos los datos de tu cuenta (nombre, teléfono, direcciones y lista de deseos) y cerramos tu sesión. Los pedidos
          que ya hiciste se conservan en el registro de la tienda. Esta acción no se puede deshacer.
        </p>
        {deleteAccount.error ? (
          <p className="acc-alert acc-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{deleteAccount.error}</span>
          </p>
        ) : null}
        {deleteAccount.showConfirm ? (
          <div className="acc-confirm">
            <strong>¿Seguro que quieres eliminar tu cuenta?</strong>
            <div className="acc-actions">
              <button type="button" className="acc-btn acc-btn--danger" onClick={confirmDelete} disabled={deleteAccount.isDeleting}>
                {deleteAccount.isDeleting ? 'Eliminando…' : 'Sí, eliminar mi cuenta'}
              </button>
              <button type="button" className="acc-btn acc-btn--ghost" onClick={() => deleteAccount.setShowConfirm(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="acc-actions">
            <button type="button" className="acc-btn acc-btn--danger-ghost" onClick={() => deleteAccount.setShowConfirm(true)}>
              Eliminar mi cuenta
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountSecurity;
