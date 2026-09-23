import React, { useEffect, useState } from "react";

// Vista de un medio de /api/media. `controls` solo en pantalla completa: en
// cuadrículas el video es una miniatura muda. El texto alternativo cubre los
// dos casos en que el medio no se puede mostrar: alt de <img> y contenido de
// respaldo de <video>.
const MediaPreview = ({ item, src, controls = false }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (failed) {
    return (
      <div className="media-fallback" role="img" aria-label={item.altText || item.title}>
        <i className="fas fa-image" aria-hidden="true" />
        <span>{item.altText || "Sin texto alternativo"}</span>
      </div>
    );
  }

  if (item.kind === "video") {
    return (
      <video
        src={src}
        controls={controls}
        muted={!controls}
        preload="metadata"
        playsInline
        aria-label={item.altText || item.title}
        onError={() => setFailed(true)}
      >
        {item.altText}
      </video>
    );
  }

  return <img src={src} alt={item.altText} loading="lazy" onError={() => setFailed(true)} />;
};

export default MediaPreview;
