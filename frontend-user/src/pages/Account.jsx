// src/pages/Account.jsx — ruta /mi-cuenta. Pendiente de rediseño.
import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../hooks/useAuth';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Account = () => {
  usePageMeta('Mi cuenta');
  const { isAuthenticated } = useAuth();

  // Requiere sesión.
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <SectionPlaceholder title="Mi cuenta" hooks="useAccount" />;
};

export default Account;
