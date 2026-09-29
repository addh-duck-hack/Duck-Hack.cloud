// src/pages/VerifyEmail.jsx — ruta /users/verify?token= (enlace del correo
// de verificación). useVerifyEmail verifica solo al abrir; si el enlace
// venció o no es válido, ofrece reenviar el correo.
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useVerifyEmail } from '../hooks/useAuthForms';
import AuthLayout from '../components/AuthLayout';
import ResendVerification from '../components/ResendVerification';

const VerifyEmail = () => {
  usePageMeta('Verificar correo');
  const { search } = useLocation();
  const { status } = useVerifyEmail(search);

  if (status === 'loading') {
    return (
      <AuthLayout title="Verificando tu" highlight="correo">
        <div className="auth-done" aria-busy="true">
          <span className="auth-done-icon" aria-hidden="true">
            <i className="fa-solid fa-spinner fa-spin" />
          </span>
          <p>Un momento, estamos activando tu cuenta…</p>
        </div>
      </AuthLayout>
    );
  }

  if (status === 'success') {
    return (
      <AuthLayout title="¡Cuenta" highlight="verificada!">
        <div className="auth-done">
          <span className="auth-done-icon" aria-hidden="true">
            <i className="fa-solid fa-check" />
          </span>
          <p>Tu correo quedó confirmado. Ya puedes iniciar sesión y comprar más rápido.</p>
          <Link to="/login" className="auth-btn">
            Iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="No pudimos" highlight="verificar tu correo">
      <div className="auth-done">
        <span className="auth-done-icon" aria-hidden="true">
          <i className="fa-solid fa-link-slash" />
        </span>
        <p>El enlace no es válido o ya venció (dura 24 horas). Escribe tu correo y te enviamos uno nuevo.</p>
        <ResendVerification label="Enviar un enlace nuevo" />
      </div>
    </AuthLayout>
  );
};

export default VerifyEmail;
