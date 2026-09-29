// src/pages/ResetPassword.jsx — ruta /restablecer-contrasena?token= (enlace
// del correo de "olvidé mi contraseña"). Formulario de useResetPassword: nueva
// contraseña + confirmación; si el enlace venció o ya se usó, ofrece pedir
// otro.
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useResetPassword } from '../hooks/useAuthForms';
import AuthLayout, { PasswordInput } from '../components/AuthLayout';

const ResetPassword = () => {
  usePageMeta('Nueva contraseña');
  const { search } = useLocation();
  const reset = useResetPassword(search);
  const [showPassword, setShowPassword] = useState(false);

  if (reset.status === 'done') {
    return (
      <AuthLayout title="¡Contraseña" highlight="actualizada!">
        <div className="auth-done">
          <span className="auth-done-icon" aria-hidden="true">
            <i className="fa-solid fa-check" />
          </span>
          <p>Ya puedes iniciar sesión con tu contraseña nueva.</p>
          <Link to="/login" className="auth-btn">
            Iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (reset.invalidToken) {
    return (
      <AuthLayout title="Enlace" highlight="vencido">
        <div className="auth-done">
          <span className="auth-done-icon" aria-hidden="true">
            <i className="fa-solid fa-link-slash" />
          </span>
          <p>Este enlace para restablecer tu contraseña no es válido, ya venció o ya se usó.</p>
          <p className="auth-muted">Los enlaces duran 1 hora y sirven una sola vez.</p>
          <Link to="/recuperar-contrasena" className="auth-btn">
            Pedir un enlace nuevo
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Casi listo" title="Crea tu nueva" highlight="contraseña">
      <form className="auth-form" onSubmit={reset.onSubmit}>
        <label className="auth-field" htmlFor="reset-password">
          <span>Contraseña nueva</span>
          <PasswordInput
            id="reset-password"
            name="password"
            value={reset.form.password}
            onChange={reset.onChange}
            autoComplete="new-password"
            minLength={6}
            required
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </label>
        <label className="auth-field" htmlFor="reset-confirm">
          <span>Confirma tu contraseña</span>
          <input
            id="reset-confirm"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={reset.form.confirmPassword}
            onChange={reset.onChange}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="auth-hint">Mínimo 6 caracteres.</p>

        {reset.error ? (
          <p className="auth-alert auth-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{reset.error}</span>
          </p>
        ) : null}

        <button type="submit" className="auth-btn" disabled={reset.status === 'sending'}>
          {reset.status === 'sending' ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
