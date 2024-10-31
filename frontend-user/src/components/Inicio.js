// src/components/Inicio.js
import React, { useState, useEffect } from 'react';
import './Inicio.css';
// Importamos las imágenes locales desde src/assets
import fondo1 from '../assets/fondo1.jpg';
import fondo2 from '../assets/fondo3.jpg';
import fondo3 from '../assets/fondo4.jpg';

const items = [
  {
    id: 1,
    imageUrl: fondo1, 
    title: 'Soluciones a Medida de tu Negocio',
    description: 'Desde el Registro de tu Dominio Hasta el Éxito Online',
  },
  {
    id: 2,
    imageUrl: fondo2, 
    title: 'Hosting Rápido, Seguro y Confiable',
    description: 'Protección Total para tu Sitio, clientes y empleados',
  },
  {
    id: 3,
    imageUrl: fondo3, 
    title: 'Impulsa tu Presencia Digital',
    description: 'Un Servicio Personalizado para Cada Cliente',
  },
];

const CarouselInicio = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [currentCharIndex, setCurrentCharIndex] = useState(0);

  // Efecto para manejar la aparición progresiva del texto de la descripción
  useEffect(() => {
    const currentDescription = items[currentIndex].description;
    if (currentCharIndex < currentDescription.length) {
      const timeoutId = setTimeout(() => {
        setDisplayedText(currentDescription.slice(0, currentCharIndex + 1));
        setCurrentCharIndex(currentCharIndex + 1);
      }, 50); // Ajusta la velocidad de la animación aquí (50ms por carácter)
      return () => clearTimeout(timeoutId);
    }
  }, [currentCharIndex, currentIndex]);

  // Reseteamos el estado del texto cuando se cambia de ítem
  useEffect(() => {
    setDisplayedText('');
    setCurrentCharIndex(0);
  }, [currentIndex]);

  return (
    <div className="carousel">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`carousel-item ${index === currentIndex ? 'active' : ''}`}
          style={{ backgroundImage: `url(${item.imageUrl})` }}
        >
          <div className="carousel-content">
            <h2>{item.title}</h2>
            <p>{displayedText}</p> {/* Muestra el texto progresivo */}
          </div>
        </div>
      ))}
      <div className="carousel-indicators">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`indicator ${index === currentIndex ? 'active' : ''}`}
            onClick={() => setCurrentIndex(index)}
          ></div>
        ))}
      </div>
    </div>
  );
};

export default CarouselInicio;
