// src/pages/Login.jsx — ruta /login. Formulario de useLoginForm; con sesión
// abierta (al entrar, o si ya había una) redirige a ?next= (solo rutas
// internas, ver safeNextPath) o a /mi-cuenta.
import React, { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../hooks/useAuth';
import { useLoginForm, safeNextPath } from '../hooks/useAuthForms';
import AuthLayout, { PasswordInput } from '../components/AuthLayout';
import ResendVerification from '../components/ResendVerification';

const Login = () => {
  usePageMeta('Iniciar sesión');
  const { isAuthenticated, sessionExpired } = useAuth();
  const [searchParams] = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));
  const [showPassword, setShowPassword] = useState(false);
  const login = useLoginForm();

  if (isAuthenticated) return <Navigate to={next} replace />;

  const nextQuery = searchParams.get('next') ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <AuthLayout eyebrow="Bienvenido de vuelta" title="Inicia" highlight="sesión">
      <form className="auth-form" onSubmit={login.onSubmit}>
        {sessionExpired ? (
          <p className="auth-alert auth-alert--info" role="status">
            <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
            <span>Tu sesión expiró. Inicia sesión de nuevo para continuar.</span>
          </p>
        ) : null}
        <label className="auth-field" htmlFor="login-email">
          <span>Correo electrónico</span>
          <input
            id="login-email"
            name="email"
            type="email"
            value={login.form.email}
            onChange={login.onChange}
            autoComplete="email"
            required
          />
        </label>
        <label className="auth-field" htmlFor="login-password">
          <span className="auth-field-row">
            Contraseña
            <Link to="/recuperar-contrasena" className="auth-link">
              ¿Olvidaste tu contraseña?
            </Link>
          </span>
          <PasswordInput
            id="login-password"
            name="password"
            value={login.form.password}
            onChange={login.onChange}
            autoComplete="current-password"
            required
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </label>

        {login.error ? (
          <p className="auth-alert auth-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{login.error}</span>
          </p>
        ) : null}
        {login.errorCode === 'ACCOUNT_NOT_VERIFIED' ? <ResendVerification email={login.form.email} /> : null}

        <button type="submit" className="auth-btn" disabled={login.isSubmitting}>
          {login.isSubmitting ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>

      <p className="auth-switch">
        ¿Aún no tienes cuenta?{' '}
        <Link to={`/register${nextQuery}`} className="auth-link">
          Crea una aquí
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Login;
