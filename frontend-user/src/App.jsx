// src/App.jsx
//
// Providers globales + mapa del sitio. Toda la lógica vive en hooks/ (sesión,
// canasta, catálogo, checkout, cuenta, formularios) — las páginas en pages/
// solo pintan. El sitio se está rediseñando sección por sección: las rutas
// que todavía no se construyen muestran SectionPlaceholder.
import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Home from './pages/Home';
import AboutUs from './pages/AboutUs';
import Customers from './pages/Customers';
import ContactUs from './pages/ContactUs';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import LegalNotice from './pages/LegalNotice';
import PrivacyNotice from './pages/PrivacyNotice';
import Login from './pages/Login';
import Register from './pages/Register';
import Account from './pages/Account';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import { StoreConfigProvider } from './hooks/useStoreConfig';
import { CartProvider } from './hooks/useCart';
import { AuthProvider } from './hooks/useAuth';

const App = () => (
  <StoreConfigProvider>
    <AuthProvider>
      <CartProvider>
        <Router>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/nosotros" element={<AboutUs />} />
              {/* Páginas retiradas: los enlaces viejos no quedan en blanco. */}
              <Route path="/servicios" element={<Navigate to="/nosotros" replace />} />
              <Route path="/precios" element={<Navigate to="/tienda" replace />} />
              <Route path="/clientes" element={<Customers />} />
              <Route path="/contacto" element={<ContactUs />} />
              <Route path="/tienda" element={<Shop />} />
              <Route path="/tienda/:id" element={<ProductDetail />} />
              <Route path="/carrito" element={<Cart />} />
              <Route path="/legal-notice" element={<LegalNotice />} />
              <Route path="/privacy-policy" element={<PrivacyNotice />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/recuperar-contrasena" element={<ForgotPassword />} />
              <Route path="/mi-cuenta" element={<Account />} />
            </Route>
            <Route path="/users/verify" element={<VerifyEmail />} />
          </Routes>
        </Router>
      </CartProvider>
    </AuthProvider>
  </StoreConfigProvider>
);

export default App;
