// src/components/OriginSection.jsx
//
// Sección de origen en Inicio: a la izquierda, título y texto sobre
// Xicotepec (fijos: el admin no tiene un campo para este bloque); a la
// derecha, el mapa de puntos del pueblo y debajo una tarjeta por cada
// StoreConfig.commands activo (ícono de Font Awesome + título + nota).
import React from 'react';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { sortActive } from '../utils/storeConfigLists';
import OriginMap from './OriginMap';
import { safeIconClass } from '../utils/icons';
import './OriginSection.css';

const OriginSection = () => {
  const { config } = useStoreConfig();
  const commands = sortActive(config?.commands || []).filter((c) => c.cmd);

  return (
    <section className="origin" aria-labelledby="origin-title">
      <div className="origin-text">
        <h2 id="origin-title" className="origin-title">
          Xicotepec,
          <em>tierra de café y tradición</em>
        </h2>
        <p className="text-justify">
          Enclavado entre las montañas de la Sierra Norte de Puebla, Xicotepec es un lugar donde la riqueza de
          la tierra, el clima y la tradición cafetalera se encuentran. Sus paisajes verdes y tierras de altura
          crean un entorno ideal para el cultivo del café, una actividad que forma parte de la identidad y el
          patrimonio de su gente.
        </p>
        <p className="text-justify">
          Cada grano que nace en esta región lleva consigo la esencia de sus montañas, el trabajo de sus
          productores y una historia que se disfruta en cada taza.
        </p>
      </div>

      <div className="origin-cards">
        <div className="origin-card origin-map-card">
          <OriginMap className="origin-map" />
          <p className="origin-map-caption">
            <strong>Xicotepec de Juárez</strong>
            Sierra Norte de Puebla, México
          </p>
        </div>

        {commands.length > 0 ? (
          <ul className="origin-commands">
            {commands.map((command, i) => {
              const icon = safeIconClass(command.icon);
              return (
                <li className="origin-card origin-command" key={`${i}-${command.cmd}`}>
                  {icon ? <i className={`${icon} origin-command-icon`} aria-hidden="true" /> : null}
                  <h3 className="origin-command-title">{command.cmd}</h3>
                  {command.note ? <p className="origin-command-note text-justify">{command.note}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
};

export default OriginSection;
