// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import Loader from './components/Loader';
import NavBar from './components/NavBar';
import Inicio from './components/Inicio';
import AboutUs from './components/AboutUs';
import OurServices from './components/OurServices';
import Services from './components/Services';
import Customers from './components/Customers';
import ContactUs from './components/ContactUs';
import Footer from './components/Footer';
import LegalNotice from './components/LegalNotice';
import PrivacyNotice from './components/PrivacyNotice';
import VerifyUser from './components/VerifyUser';
import { scroller } from 'react-scroll';
import './App.css';

const ScrollToSection = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const section = location.hash.substring(1); // Remueve el "#" de la URL
      scroller.scrollTo(section, { smooth: true, offset: -70 });
    }
  }, [location.hash]);

  return null;
};

const App = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simula una carga de 3 segundos para el efecto de carga
    const timer = setTimeout(() => {
      setLoading(false);
      document.body.classList.add('loaded');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Router>
      <div className="App">
        <NavBar /> {/* Barra de navegación siempre visible */}
        <main className="main-content">
          {loading ? (
            <Loader />
          ) : (
            <>
              <ScrollToSection /> {/* Desplazamiento automático después del loader */}
              <Routes>
                <Route
                  path="/"
                  element={
                    <>
                      <Inicio />
                      <AboutUs />
                      <OurServices />
                      <Services />
                      <Customers />
                      <ContactUs />
                    </>
                  }
                />
                <Route path="/legal-notice" element={<LegalNotice />} />
                <Route path="/privacy-policy" element={<PrivacyNotice />} />
                <Route path="/users/verify" element={<VerifyUser />} />
              </Routes>
            </>
          )}
        </main>
        <Footer />
      </div>
    </Router>
  );
};

export default App;