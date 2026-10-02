// src/components/WhatsAppButton.jsx — botón flotante de WhatsApp en todo el
// sitio (StoreConfig.whatsappButton). No se pinta si el admin no lo encendió
// o no capturó el número. Se oculta mientras la canasta lateral está abierta
// para no taparle el botón de pagar.
import React from 'react';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { useCart } from '../hooks/useCart';
import { whatsappButtonHref } from '../utils/links';
import './WhatsAppButton.css';

const WhatsAppButton = () => {
  const { config } = useStoreConfig();
  const { isCartOpen } = useCart();
  const href = whatsappButtonHref(config?.whatsappButton);
  if (!href || isCartOpen) return null;

  return (
    <a className="wa-float" href={href} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp">
      <i className="fa-brands fa-whatsapp" aria-hidden="true" />
    </a>
  );
};

export default WhatsAppButton;
