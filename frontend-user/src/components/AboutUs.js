// src/components/AboutUs.js
import React from 'react';
import teamImage from '../assets/team-image.jpg';
import { usePageMeta } from '../hooks/usePageMeta';
import './AboutUs.css';

const AboutUs = () => {
  usePageMeta(
    'Quiénes Somos',
    'Conoce al equipo de Duck-Hack: más de 5 años de experiencia en desarrollo web y hosting para negocios en México.'
  );

  return (
    <section className="about-view">
      <span className="eyebrow">/nosotros</span>
      <h1 className="section-title">El equipo detrás del panel</h1>

      <div className="about-grid">
        <figure className="about-photo">
          <span className="tag">team.jpg</span>
          <img src={teamImage} alt="Equipo Duck-Hack" />
        </figure>

        <div className="about-copy">
          <p>
            Nuestros colaboradores, quienes cuentan con más de 5 años de experiencia en el
            campo de la tecnología, te ofrecerán las mejores soluciones digitales a medida.
            Nuestra pasión por la tecnología y el diseño nos impulsa a superar tus
            expectativas. Conoce al equipo que hará realidad tus proyectos.
          </p>

          <div className="kv">
            <div className="cell">
              <h3>misión</h3>
              <p>
                Ayudar a las empresas a crecer digitalmente con soluciones web
                personalizadas y un servicio de hosting robusto, garantizando la seguridad
                y el rendimiento de sus proyectos online.
              </p>
            </div>
            <div className="cell">
              <h3>visión</h3>
              <p>
                Ser una empresa líder en desarrollo web y hosting, reconocida por nuestro
                compromiso con la innovación, la calidad y la satisfacción de nuestros
                clientes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutUs;
