// src/components/Loader.jsx
import React from 'react';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import BrandMarks, { BrandSeal } from './BrandMarks';
import './Loader.css';

const Loader = () => {
  // El Loader se muestra durante el arranque, casi siempre antes de que
  // /api/store-config/public alcance a responder — así que en la práctica
  // casi siempre se ve el sello local. Si el config ya resolvió (navegación
  // repetida) y trae logoUrl, se usa esa imagen.
  const { config } = useStoreConfig();
  const logoSrc = resolveStoreImageUrl(config?.logoUrl);

  return (
    <div className="loader-container">
      <BrandMarks />
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={config?.storeName || 'Café Tacita'}
          className="loader-logo"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <BrandSeal className="loader-seal" />
      )}
    </div>
  );
};

export default Loader;
