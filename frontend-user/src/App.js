// src/App.js
import React, { useState, useEffect } from 'react';
import Loader from './components/Loader';
import NavBar from './components/NavBar';
import Inicio from './components/Inicio';
import AboutUs from './components/AboutUs';
import OurServices from './components/OurServices';
import Services from './components/Services';
import Customers from './components/Customers';
import ContactUs from './components/ContactUs';
import Footer from './components/Footer';
import './App.css';

const App = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulamos una carga de la página de 3 segundos (para el efecto de carga)
    const timer = setTimeout(() => {
      setLoading(false);
      document.body.classList.add('loaded'); // Añadir la clase 'loaded' para detener la animación
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="App">
      <NavBar /> {/* Barra de navegación siempre visible */}
      {loading ? (
        <Loader />
      ) : (
        <>
          <Inicio /> 
          <AboutUs />
          <OurServices />
          <Services />
          <Customers />
          <ContactUs />
          <Footer />
        </>
      )}
    </div>
  );
};

export default App;