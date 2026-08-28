// src/components/Loader.js
import React from 'react';
import logo from '../assets/logo.png';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import './Loader.css';

const Loader = () => {
  // Nota: el Loader se muestra durante el arranque de la app, justo cuando
  // el StoreConfigProvider recién empezó a pedir /api/store-config/public
  // — casi siempre no habrá alcanzado a responder todavía, así que en la
  // práctica esto casi siempre muestra el logo local. Se deja igual la
  // lectura del config por si el fetch ya resolvió (navegación repetida).
  const { config } = useStoreConfig();
  const logoSrc = resolveStoreImageUrl(config?.logoUrl) || logo;

  return (
    <div className="loader-container">
      <img src={logoSrc} alt={config?.storeName || 'Duck-Hack Logo'} className="loader-logo" />
    </div>
  );
};

export default Loader;