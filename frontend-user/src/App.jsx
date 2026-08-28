// src/App.js
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Loader from './components/Loader';
import Inicio from './components/Inicio';
import AboutUs from './components/AboutUs';
import OurServices from './components/OurServices';
import Services from './components/Services';
import Customers from './components/Customers';
import ContactUs from './components/ContactUs';
import LegalNotice from './components/LegalNotice';
import PrivacyNotice from './components/PrivacyNotice';
import VerifyUser from './components/VerifyUser';
import LoginUser from './components/LoginUser';
import RegisterUser from './components/RegisterUser';
import { StoreConfigProvider } from './hooks/useStoreConfig';
import './App.css';

const App = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
      document.body.classList.add('loaded');
    }, 1400);

    return () => clearTimeout(timer);
  }, []);

  return (
    <StoreConfigProvider>
      <Router>
        <div className="App">
          {loading ? (
            <Loader />
          ) : (
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<Inicio />} />
                <Route path="/nosotros" element={<AboutUs />} />
                <Route path="/servicios" element={<OurServices />} />
                <Route path="/precios" element={<Services />} />
                <Route path="/clientes" element={<Customers />} />
                <Route path="/contacto" element={<ContactUs />} />
                <Route path="/legal-notice" element={<LegalNotice />} />
                <Route path="/privacy-policy" element={<PrivacyNotice />} />
              </Route>
              <Route path="/users/verify" element={<VerifyUser />} />
              <Route path="/login" element={<LoginUser />} />
              <Route path="/register" element={<RegisterUser />} />
            </Routes>
          )}
        </div>
      </Router>
    </StoreConfigProvider>
  );
};

export default App;
