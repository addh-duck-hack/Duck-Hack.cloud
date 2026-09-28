// src/pages/ForgotPassword.jsx — ruta /recuperar-contrasena. Formulario de
// useForgotPassword. El endpoint (POST /api/users/forgot-password) todavía
// no existe en core-api: mientras tanto la página lo dice y ofrece contacto;
// cuando exista, muestra el mensaje genérico de "revisa tu correo".
import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useForgotPassword } from '../hooks/useAuthForms';
import AuthLayout from '../components/AuthLayout';

const ForgotPassword = () => {
  usePageMeta('Recuperar contraseña');
  const forgot = useForgotPassword();

  if (forgot.status === 'sent') {
    return (
      <AuthLayout title="Revisa tu" highlight="correo">
        <div className="auth-done">
          <span className="auth-done-icon" aria-hidden="true">
            <i className="fa-regular fa-envelope-open" />
          </span>
          <p>
            Si hay una cuenta con <strong>{forgot.email}</strong>, te enviamos un enlace para crear una contraseña nueva.
          </p>
          <p className="auth-muted">El enlace vence pronto. ¿No lo ves? Revisa tu carpeta de spam.</p>
          <Link to="/login" className="auth-btn">
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Sin problema" title="Recupera tu" highlight="contraseña">
      <p className="auth-lead">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
      <form className="auth-form" onSubmit={forgot.onSubmit}>
        <label className="auth-field" htmlFor="forgot-email">
          <span>Correo electrónico</span>
          <input
            id="forgot-email"
            type="email"
            value={forgot.email}
            onChange={(e) => forgot.setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        {forgot.status === 'unavailable' ? (
          <p className="auth-alert auth-alert--info" role="status">
            <i className="fa-solid fa-circle-info" aria-hidden="true" />
            <span>
              La recuperación de contraseña estará disponible muy pronto. Mientras tanto,{' '}
              <Link to="/contacto">escríbenos</Link> y te ayudamos a recuperar tu acceso.
            </span>
          </p>
        ) : null}
        {forgot.error ? (
          <p className="auth-alert auth-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{forgot.error}</span>
          </p>
        ) : null}

        <button type="submit" className="auth-btn" disabled={forgot.status === 'sending'}>
          {forgot.status === 'sending' ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>

      <p className="auth-switch">
        ¿La recordaste?{' '}
        <Link to="/login" className="auth-link">
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  );
};

export default ForgotPassword;
