// src/components/StoreImage.jsx
//
// Imagen que llega desde el admin (StoreConfig o Product). `src` es la ruta
// relativa que guarda el backend ("uploads/xxx.jpg") o ya una URL absoluta.
// Si no hay imagen, o la que hay no carga (archivo borrado, subida perdida en
// un redeploy), se pinta el recuadro .img-placeholder con `label` en su
// lugar — el sitio no lleva imágenes locales de respaldo.
import React, { useEffect, useState } from 'react';
import { resolveStoreImageUrl } from '../hooks/useStoreConfig';

const isAbsolute = (value) => /^(https?:|blob:|data:)/.test(value);

const StoreImage = ({ src, alt = '', label, className = '', ...imgProps }) => {
  const url = src ? (isAbsolute(src) ? src : resolveStoreImageUrl(src)) : '';
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  if (!url || failed) {
    return (
      <div className={`img-placeholder ${className}`.trim()} role="img" aria-label={alt || label || 'Imagen'}>
        {label || alt || 'Imagen'}
      </div>
    );
  }

  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} {...imgProps} />;
};

export default StoreImage;
