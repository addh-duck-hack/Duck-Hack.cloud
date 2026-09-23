// src/pages/VerifyEmail.jsx — ruta /users/verify (enlace del correo de
// verificación, fuera de AppShell). Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const VerifyEmail = () => {
  usePageMeta('Verificar correo');
  return <SectionPlaceholder title="Verificar correo" hooks="useVerifyEmail" />;
};

export default VerifyEmail;
