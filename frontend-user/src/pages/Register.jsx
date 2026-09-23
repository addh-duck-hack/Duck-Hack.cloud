// src/pages/Register.jsx — ruta /register. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Register = () => {
  usePageMeta('Crear cuenta');
  return <SectionPlaceholder title="Crear cuenta" hooks="useRegisterForm" />;
};

export default Register;
