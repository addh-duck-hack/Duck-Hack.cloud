// src/components/MetricsTimeline.jsx
//
// Métricas de StoreConfig (admin > Métricas: etiqueta + valor) como una línea
// de proceso: valor grande arriba, punto numerado 01, 02… unido por una
// línea, y la etiqueta abajo. En móvil, o con más de 5 métricas, la línea
// pasa a vertical. Sin métricas configuradas la sección no se muestra.
import React from 'react';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { sortActive } from '../utils/storeConfigLists';
import './MetricsTimeline.css';

const MAX_HORIZONTAL = 5;

const MetricsTimeline = () => {
  const { config } = useStoreConfig();
  const metrics = sortActive(config?.metrics || []).filter((m) => m.label || m.value);

  if (metrics.length === 0) return null;

  const isVertical = metrics.length > MAX_HORIZONTAL;

  return (
    <section className="metrics" aria-label="Nuestro proceso en cifras">
      <ol
        className={`metrics-timeline${isVertical ? ' is-vertical' : ''}`}
        style={{ '--metric-count': metrics.length }}
      >
        {metrics.map((metric, i) => (
          <li className="metric" key={`${i}-${metric.label}`}>
            <span className="metric-value">{metric.value}</span>
            <span className="metric-track" aria-hidden="true">
              <span className="metric-dot">{String(i + 1).padStart(2, '0')}</span>
            </span>
            <span className="metric-label">{metric.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default MetricsTimeline;
