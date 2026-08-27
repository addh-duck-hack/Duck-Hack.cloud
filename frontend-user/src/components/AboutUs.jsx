// src/components/AboutUs.js
import React from 'react';
import teamPlaceholder from '../assets/team-placeholder.jpg';
import adrianPhoto from '../assets/collaborators/adrian.webp';
import gerardoPhoto from '../assets/collaborators/gerardo.webp';
import cesarPhoto from '../assets/collaborators/cesar.webp';
import { usePageMeta } from '../hooks/usePageMeta';
import './AboutUs.css';

const TEAM = [
  {
    name: 'Adrián Jacobo',
    role: 'Arquitecto de Software — Backend, DevOps & Seguridad',
    bio: 'Diseña la arquitectura de cada proyecto y está a cargo de todo el ciclo: del código a producción, pasando por DevOps, infraestructura y seguridad, para que todo funcione y escale sin sorpresas.',
    email: 'adrian.jacobo@duck-hack.com',
    phone: '+52 771 774 2823',
    photo: adrianPhoto,
  },
  {
    name: 'Gerardo Jacobo',
    role: 'Desarrollador Web — Angular, React & CSS',
    bio: 'Se especializa en interfaces rápidas y bien cuidadas, combinando Angular, React y CSS para que cada sitio se sienta tan bien como se ve.',
    email: 'gerardo.jacobo@duck-hack.com',
    phone: '',
    photo: gerardoPhoto,
  },
  {
    name: 'César Jacobo',
    role: 'Desarrollador Móvil — Android & iOS',
    bio: 'Lleva tu negocio al bolsillo de tus clientes con aplicaciones nativas fluidas para Android y iOS.',
    email: 'cesar.jacobo@duck-hack.com',
    phone: '+52 771 762 1512',
    photo: cesarPhoto,
  },
  {
    name: 'Denisse Maldonado',
    role: 'Project Manager',
    bio: 'Coordina cada proyecto de principio a fin, asegurando que tiempos, entregables y comunicación con el cliente avancen sin fricciones.',
    email: 'denisse.maldonado@duck-hack.com',
    phone: '+52 56 3102 5569',
  },
  /*{
    name: 'Paola Martínez',
    role: 'Contabilidad y Administración',
    bio: 'Mantiene la operación de Duck-Hack funcionando sin fricciones, para que cada proyecto avance a tiempo.',
    email: 'paola.martinez@duck-hack.com',
    phone: '+52 55 0000 0005',
  },*/
];

const AboutUs = () => {
  usePageMeta(
    'Quiénes Somos',
    'Conoce al equipo de Duck-Hack: más de 5 años de experiencia en desarrollo web y hosting para negocios en México.'
  );

  return (
    <section className="about-view">
      <span className="eyebrow">/nosotros</span>
      <h1 className="section-title">El equipo detrás del software</h1>
      <p className="section-sub">
        Nuestros colaboradores, quienes cuentan con más de 8 años de experiencia en el campo de
        la tecnología, te ofrecerán las mejores soluciones digitales a medida.
      </p>

      <div className="mission-vision">
        <div className="mv-cell">
          <div className="mv-icon">
            <i className="fas fa-bullseye" />
          </div>
          <h3>Misión</h3>
          <p>
            Ayudar a las empresas a crecer digitalmente con soluciones web personalizadas y un
            servicio de hosting robusto, garantizando la seguridad y el rendimiento de sus
            proyectos online. Trabajamos codo a codo con cada cliente para entender su negocio
            antes de escribir una sola línea de código, y nos mantenemos a su lado después del
            lanzamiento, con soporte real, en español y sin letra chica.
          </p>
        </div>
        <div className="mv-cell">
          <div className="mv-icon">
            <i className="fas fa-eye" />
          </div>
          <h3>Visión</h3>
          <p>
            Ser una empresa líder en desarrollo web y hosting, reconocida por nuestro compromiso
            con la innovación, la calidad y la satisfacción de nuestros clientes. Aspiramos a que
            cada negocio que confía en nosotros, sin importar su tamaño, tenga acceso a la misma
            calidad de tecnología, diseño y soporte que normalmente solo las grandes empresas
            pueden pagar.
          </p>
        </div>
      </div>

      <h2 className="team-title">Nuestro equipo</h2>
      <p className="section-sub">Las personas que hacen posible cada proyecto, de principio a fin.</p>

      <div className="team-heroes">
        {TEAM.map((member) => (
          <div className="team-hero" key={member.name}>
            <div className="team-hero-media">
              <img src={member.photo || teamPlaceholder} alt={member.name} />
            </div>
            <div className="team-hero-content">
              <h3>{member.name}</h3>
              <p className="team-role">{member.role}</p>
              <p className="team-bio">{member.bio}</p>
              <div className="team-contact">
                {member.email && (
                  <a href={`mailto:${member.email}`}>
                    <i className="fas fa-envelope" /> {member.email}
                  </a>
                )}
                {member.phone && (
                  <a href={`tel:${member.phone.replace(/\s+/g, '')}`}>
                    <i className="fas fa-phone" /> {member.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AboutUs;
