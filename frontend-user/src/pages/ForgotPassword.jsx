// src/pages/ForgotPassword.jsx — ruta /recuperar-contrasena.
//
// Placeholder: la recuperación de contraseña todavía no existe (no hay
// endpoint en packages/core-api/modules/auth.js ni correo de restablecimiento).
// El enlace del footer ya apunta aquí para construir la función después.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const ForgotPassword = () => {
  usePageMeta('Recuperar contraseña');
  return <SectionPlaceholder title="Recuperar contraseña" hooks="próximamente (falta endpoint en core-api)" />;
};

export default ForgotPassword;
