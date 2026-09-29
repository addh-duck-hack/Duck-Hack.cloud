// src/pages/Register.jsx — ruta /register. Formulario de useRegisterForm con
// confirmación de contraseña. Registrarse no inicia sesión (el backend exige
// verificar el correo), así que al terminar se pide revisar el correo.
import React, { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../hooks/useAuth';
import { useRegisterForm, safeNextPath } from '../hooks/useAuthForms';
import AuthLayout, { PasswordInput } from '../components/AuthLayout';
import ResendVerification from '../components/ResendVerification';

const Register = () => {
  usePageMeta('Crear cuenta', 'Crea tu cuenta para comprar más rápido, guardar tus direcciones y seguir tus pedidos.');
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const register = useRegisterForm({ confirmPassword: true });
  const { form, onChange } = register;

  if (isAuthenticated) return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;

  const nextQuery = searchParams.get('next') ? `?next=${encodeURIComponent(safeNextPath(searchParams.get('next')))}` : '';

  if (register.success) {
    return (
      <AuthLayout title="Revisa tu" highlight="correo">
        <div className="auth-done">
          <span className="auth-done-icon" aria-hidden="true">
            <i className="fa-regular fa-envelope-open" />
          </span>
          <p>
            Te enviamos un enlace a <strong>{form.email}</strong> para activar tu cuenta. Ábrelo y después inicia sesión.
          </p>
          <p className="auth-muted">¿No lo ves? Revisa tu carpeta de spam o promociones.</p>
          <Link to={`/login${nextQuery}`} className="auth-btn">
            Ir a iniciar sesión
          </Link>
          <ResendVerification email={form.email} label="¿No llegó? Reenviar correo" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Únete a la familia" title="Crea tu" highlight="cuenta">
      <form className="auth-form" onSubmit={register.onSubmit}>
        <div className="auth-grid">
          <label className="auth-field" htmlFor="reg-name">
            <span>Nombre completo</span>
            <input id="reg-name" name="name" value={form.name} onChange={onChange} autoComplete="name" minLength={2} maxLength={80} required />
          </label>
          <label className="auth-field" htmlFor="reg-phone">
            <span>Teléfono (opcional)</span>
            <input
              id="reg-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={onChange}
              autoComplete="tel"
              placeholder="10 dígitos"
            />
          </label>
        </div>
        <label className="auth-field" htmlFor="reg-email">
          <span>Correo electrónico</span>
          <input id="reg-email" name="email" type="email" value={form.email} onChange={onChange} autoComplete="email" required />
        </label>
        <div className="auth-grid">
          <label className="auth-field" htmlFor="reg-password">
            <span>Contraseña</span>
            <PasswordInput
              id="reg-password"
              name="password"
              value={form.password}
              onChange={onChange}
              autoComplete="new-password"
              minLength={6}
              required
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </label>
          <label className="auth-field" htmlFor="reg-confirm">
            <span>Confirma tu contraseña</span>
            <input
              id="reg-confirm"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={onChange}
              autoComplete="new-password"
              required
            />
          </label>
        </div>
        <p className="auth-hint">Mínimo 6 caracteres.</p>

        <label className="auth-check">
          {/* Mensaje propio: el del navegador ("Controla esta casilla…") suena raro. */}
          <input
            type="checkbox"
            required
            onInvalid={(e) => e.target.setCustomValidity('Marca esta casilla para continuar.')}
            onChange={(e) => e.target.setCustomValidity('')}
          />
          <span>
            Acepto el <Link to="/privacy-policy">Aviso de privacidad</Link>.
          </span>
        </label>

        {register.error ? (
          <p className="auth-alert auth-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{register.error}</span>
          </p>
        ) : null}

        <button type="submit" className="auth-btn" disabled={register.isSubmitting}>
          {register.isSubmitting ? 'Creando tu cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="auth-switch">
        ¿Ya tienes cuenta?{' '}
        <Link to={`/login${nextQuery}`} className="auth-link">
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Register;
