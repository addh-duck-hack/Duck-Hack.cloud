// src/pages/ContactUs.jsx — ruta /contacto. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const ContactUs = () => {
  usePageMeta(
    'Contacto',
    'Escríbenos por WhatsApp o correo. Pedidos, mayoreo para cafeterías, suscripción o una visita a la finca en Xicotepec.'
  );
  return <SectionPlaceholder title="Contacto" hooks="useContactForm, useStoreConfig" />;
};

export default ContactUs;
