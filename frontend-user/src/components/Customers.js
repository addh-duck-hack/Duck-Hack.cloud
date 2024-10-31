// src/components/Customers.js
import React from 'react';
import './Customers.css';

// Importamos las imágenes locales
import latitud from '../assets/latitud-logo.png';
import textuales from '../assets/textuales-logo.png';
import quintosol from '../assets/quintosol-logo.png';
import salaverry from '../assets/salaverry-logo.png';

const customerLogos = [
    { id: 1, src: latitud, alt: 'Latitud megalópolis / El primer diario digital de la megalópolis', url: 'https://latitudmegalopolis.com/' },
    { id: 2, src: textuales, alt: 'Textual-es', url: 'https://textual-es.com/' },
    { id: 3, src: quintosol, alt: 'El quinto sol / Inovación y talento', url: 'https://elquintosolmarketing.com/' },
    { id: 4, src: salaverry, alt: 'Torre Médica Salaverry / Clínica de Especialidades', url: 'https://medicasalaverry.com/' },
    { id: 5, src: latitud, alt: 'Latitud megalópolis / El primer diario digital de la megalópolis', url: 'https://latitudmegalopolis.com/' },
    { id: 6, src: textuales, alt: 'Textual-es', url: 'https://textual-es.com/' },
    { id: 7, src: quintosol, alt: 'El quinto sol / Inovación y talento', url: 'https://elquintosolmarketing.com/' },
    { id: 8, src: salaverry, alt: 'Torre Médica Salaverry / Clínica de Especialidades', url: 'https://medicasalaverry.com/' }
  ];
  
  const Customers = () => {
    return (
      <section id="customers" className="customers-section">
        <h2 className="customers-title">NUESTROS CLIENTES</h2>
        <div className="customers-scroll">
          <div className="customers-container">
            {[...customerLogos, ...customerLogos].map((logo, index) => (
              <div className="customer-logo" key={index}>
                <a href={logo.url} target="_blank" rel="noopener noreferrer">
                  <img src={logo.src} alt={logo.alt} />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };
  
  export default Customers;