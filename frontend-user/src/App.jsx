// src/App.jsx — sitio de salón de belleza con tienda de maquillaje
// (release-citas+tienda). Usa los módulos del backend: servicios y agenda,
// recordatorios y reseña post-cita (/cita/:id), tienda con variantes,
// cupones, reseñas, favoritos y aviso de disponibilidad, carrito guardado
// (carrito abandonado), lealtad (puntos y sellos), banners de promoción y
// pago por transferencia con comprobante (/pedido/:id).
import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { CartProvider } from './hooks/useCart';
import { FavoritesProvider } from './hooks/useFavorites';
import { StoreConfigProvider } from './hooks/useStoreConfig';
import Layout from './ui/Layout';
import Account from './pages/Account';
import Appointment from './pages/Appointment';
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/Auth';
import Book from './pages/Book';
import Cart from './pages/Cart';
import Home from './pages/Home';
import { Contact, Legal, NotFound } from './pages/Info';
import Order from './pages/Order';
import Product from './pages/Product';
import Services from './pages/Services';
import { GiftCardPurchase, GiftCardShop } from './pages/GiftCards';
import Shop from './pages/Shop';

const App = () => (
  <StoreConfigProvider>
    <AuthProvider>
      <CartProvider>
        <FavoritesProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/servicios" element={<Services />} />
                <Route path="/agendar" element={<Book />} />
                <Route path="/cita/:id" element={<Appointment />} />
                <Route path="/tienda" element={<Shop />} />
                <Route path="/tienda/:id" element={<Product />} />
                <Route path="/carrito" element={<Cart />} />
                <Route path="/pedido/:id" element={<Order />} />
                <Route path="/cuenta" element={<Account />} />
                <Route path="/login" element={<Login />} />
                <Route path="/registro" element={<Register />} />
                <Route path="/users/verify" element={<VerifyEmail />} />
                <Route path="/olvide-contrasena" element={<ForgotPassword />} />
                <Route path="/restablecer-contrasena" element={<ResetPassword />} />
                <Route path="/tarjeta-regalo" element={<GiftCardShop />} />
                <Route path="/tarjeta-regalo/:id" element={<GiftCardPurchase />} />
                <Route path="/contacto" element={<Contact />} />
                <Route path="/legal/:page" element={<Legal />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </FavoritesProvider>
      </CartProvider>
    </AuthProvider>
  </StoreConfigProvider>
);

export default App;
