// src/components/TeamSection.jsx
//
// "De la siembra a tu taza" en /nosotros: un bloque grande por cada miembro
// activo de StoreConfig.teamMembers, uno debajo de otro, alternando el lado
// de la foto. Cada bloque: foto vertical, "Equipo – Nombre", nombre, puesto
// con viñeta en acento, biografía (HTML básico sanitizado vía RichText) y,
// si están llenos, correo y teléfono.
// Sin miembros configurados la sección no se muestra.
import React from 'react';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { sortActive } from '../utils/storeConfigLists';
import { htmlToText } from '../utils/htmlExcerpt';
import { telHref } from '../utils/links';
import StoreImage from './StoreImage';
import RichText from './RichText';
import './TeamSection.css';

const TeamMember = ({ member, reversed }) => {
  // htmlToText solo decide si la biografía tiene contenido visible; se pinta
  // con su formato vía RichText.
  const hasBio = Boolean(htmlToText(member.bio));
  const email = (member.email || '').trim();
  const phone = (member.phone || '').trim();
  const phoneHref = telHref(phone);

  return (
    <article className={`team-member${reversed ? ' team-member--reversed' : ''}`}>
      <StoreImage src={member.photoUrl} alt={member.name} label={`Foto de ${member.name}`} className="team-photo" />

      <div className="team-info">
        <p className="team-crumb">
          Equipo <span aria-hidden="true">–</span> <strong>{member.name}</strong>
        </p>
        <h3 className="team-name">{member.name}</h3>
        {member.role ? <p className="team-role">{member.role}</p> : null}
        {hasBio ? <RichText html={member.bio} className="team-bio" /> : null}

        {email || phoneHref ? (
          <ul className="team-contact" aria-label={`Contacto de ${member.name}`}>
            {email ? (
              <li>
                <a href={`mailto:${email}`}>
                  <i className="fa-solid fa-envelope" aria-hidden="true" />
                  {email}
                </a>
              </li>
            ) : null}
            {phoneHref ? (
              <li>
                <a href={phoneHref}>
                  <i className="fa-solid fa-phone" aria-hidden="true" />
                  {phone}
                </a>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </article>
  );
};

const TeamSection = () => {
  const { config } = useStoreConfig();
  const members = sortActive(config?.teamMembers || []).filter((m) => m.name);

  if (members.length === 0) return null;

  return (
    <section className="team" aria-labelledby="team-title">
      <header className="team-header">
        <h2 id="team-title" className="team-title">
          De la siembra a tu taza
        </h2>
        <p className="team-lead">Las manos que cuidan nuestro café en cada etapa.</p>
      </header>

      <div className="team-list">
        {members.map((member, i) => (
          <TeamMember key={`${i}-${member.name}`} member={member} reversed={i % 2 === 1} />
        ))}
      </div>
    </section>
  );
};

export default TeamSection;
