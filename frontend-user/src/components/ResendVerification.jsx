// src/components/ResendVerification.jsx
//
// "Reenviar correo de verificación" (useResendVerification). Con `email`
// reenvía a ese correo con un botón; sin él, pide el correo. Lo usan el
// login (cuenta sin verificar), el registro completado y /users/verify con
// un enlace vencido. Estilos de AuthLayout.css.
import React, { useState } from 'react';
import { useResendVerification } from '../hooks/useAuthForms';

const ResendVerification = ({ email, label = 'Reenviar correo de verificación' }) => {
  const resend = useResendVerification();
  const [typedEmail, setTypedEmail] = useState('');

  if (resend.status === 'sent') {
    return (
      <p className="auth-alert auth-alert--info" role="status">
        <i className="fa-solid fa-paper-plane" aria-hidden="true" />
        <span>Listo: si tu cuenta está pendiente de verificar, te enviamos un nuevo enlace. Revisa tu correo (y la carpeta de spam).</span>
      </p>
    );
  }

  const target = email || typedEmail;

  return (
    <div className="auth-resend">
      {email ? null : (
        <label className="auth-field" htmlFor="resend-email">
          <span>Correo de tu cuenta</span>
          <input
            id="resend-email"
            type="email"
            value={typedEmail}
            onChange={(e) => setTypedEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
      )}
      <button
        type="button"
        className="auth-btn auth-btn--ghost"
        onClick={() => resend.resend(target)}
        disabled={resend.status === 'sending'}
      >
        <i className="fa-regular fa-envelope" aria-hidden="true" />
        {resend.status === 'sending' ? 'Enviando…' : label}
      </button>
      {resend.error ? (
        <p className="auth-alert auth-alert--error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{resend.error}</span>
        </p>
      ) : null}
    </div>
  );
};

export default ResendVerification;
