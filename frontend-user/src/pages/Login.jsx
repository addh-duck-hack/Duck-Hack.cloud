// src/pages/Login.jsx — ruta /login. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Login = () => {
  usePageMeta('Iniciar sesión');
  return <SectionPlaceholder title="Iniciar sesión" hooks="useLoginForm" />;
};

export default Login;
