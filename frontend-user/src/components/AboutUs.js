// src/components/AboutUs.js
import React from 'react';
import './AboutUs.css';

// Importamos las imágenes locales
import sample1 from '../assets/sample6.jpg';
import sample2 from '../assets/sample9.jpg';
import sample3 from '../assets/sample8.jpg';
import sample4 from '../assets/sample4.jpg';

const AboutUs = () => {
  return (
    <section id="about-us" className="about-us">
      <div className="about-us-columns">
      <div className="mission">
          <h3>Quiénes Somos</h3>
          <p>
            Nuestros colaboradores, quienes cuentan con más de 5 años de experiencia en el campo de la tecnología, te ofrecerán las mejores soluciones digitales a medida.
            Nuestra pasión por la tecnología y el diseño nos impulsa a superar tus expectativas. Conoce al equipo que hará realidad tus proyectos.
          </p>
          <h3>Nuestra Misión</h3>
          <p>
            Ayudar a las empresas a crecer digitalmente con soluciones web personalizadas y un servicio de hosting robusto,garantizando la seguridad y el rendimiento de sus proyectos online.
          </p>
          <h3>Nuestra Visión</h3>
          <p>
            Ser una empresa líder en desarrollo web y hosting, reconocida por nuestro compromiso con la innovación, la calidad y la satisfacción de nuestros clientes.
          </p>
        </div>
        <div className="images-container">
          <div className="image-grid">
            <div className="image-item-1">
              <img src={sample1} alt="Imagen 1" />
            </div>
            <div className="image-item-2">
              <img src={sample2} alt="Imagen 1" />
            </div>
            <div className="image-item-3">
              <img src={sample3} alt="Imagen 1" />
            </div>
            <div className="image-item-4">
              <img src={sample4} alt="Imagen 1" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutUs;

