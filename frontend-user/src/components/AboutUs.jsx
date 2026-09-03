// src/components/AboutUs.jsx — PROPUESTA B: "Nuestra raíz"
//
// Historia editorial (origen, herencia totonaca, cadena completa) + la familia
// productora (teamMembers). El proceso paso a paso vive en /servicios; aquí solo
// la narrativa y las personas.
import React, { useMemo } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import RichText from './RichText';
import './AboutUs.css';

const FALLBACK_TEAM = [
  {
    name: 'Don Aurelio Xochit',
    role: 'Fundador y cafetalero',
    bio: 'Sembró su primer cafetal en 1979. Todavía sube a cortar cada mañana.',
  },
  {
    name: 'María Xochit',
    role: 'Beneficio y calidad',
    bio: 'Decide qué lote entra a tueste y cuál se reprocesa.',
  },
  {
    name: 'Tonalli Xochit',
    role: 'Maestro tostador',
    bio: 'Perfila cada cosecha en el tostador de tambor de la familia.',
  },
  {
    name: 'Citlali Xochit',
    role: 'Ventas y comunidad',
    bio: 'Lleva el café a cafeterías y ferias por todo el país.',
  },
];

const initialsOf = (name) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const AboutUs = () => {
  usePageMeta(
    'Nuestra raíz',
    'La finca de la familia Xochit en Xicotepec de Juárez, Puebla. Cinco generaciones cafetaleras de herencia totonaca — de Sutu Cha\'Nu.'
  );

  const { config } = useStoreConfig();
  const team = useMemo(() => pickList(config?.teamMembers, FALLBACK_TEAM), [config]);

  return (
    <section className="about-view">
      <span className="eyebrow">Nuestra raíz</span>
      <h1 className="section-title">La finca de la familia Xochit</h1>

      <div className="prose">
        <p className="dropcap">
          Café Tacita nace en Xicotepec de Juárez, entre neblina y cafetales de sombra a 1,300 metros sobre el nivel
          del mar. Don Aurelio sembró el primer lote en 1979; hoy la finca la trabaja toda la familia.
        </p>
        <p>
          <em className="script">Sutu Cha'Nu</em> es tutunakú —la lengua totonaca de la región— y nombra a la tierra
          que nos da de comer. Ponerlo en la etiqueta es decir de dónde venimos y a quién le debemos cada taza.
        </p>
        <p>
          Controlamos toda la cadena: el vivero, la cosecha grano por grano, el beneficio húmedo con agua de manantial,
          el secado al sol, el tueste por lote y el empaque bajo pedido. Nada sale de nuestras manos hasta que va a las
          tuyas.
        </p>
      </div>

      <hr className="rule" />

      <div className="section-head" style={{ textAlign: 'left' }}>
        <span className="kicker">Quiénes somos</span>
        <h2>La familia productora</h2>
      </div>

      <div className="team-grid">
        {team.map((member) => {
          const photo = resolveStoreImageUrl(member.photoUrl);
          return (
            <div className="tm" key={member.name}>
              {photo ? (
                <img className="tm-av tm-av-img" src={photo} alt={member.name} />
              ) : (
                <div className="tm-av">{initialsOf(member.name)}</div>
              )}
              <h3>{member.name}</h3>
              <div className="tm-role">{member.role}</div>
              <RichText className="tm-bio" html={member.bio} />
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default AboutUs;
