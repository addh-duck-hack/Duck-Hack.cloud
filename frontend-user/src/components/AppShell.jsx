// src/components/AppShell.jsx
//
// Layout común de todas las rutas públicas (header + contenido + footer).
// Pendiente de diseño: por ahora solo pinta la página actual. Datos que usaba
// el shell anterior y que el nuevo seguirá necesitando:
//   - useStoreConfig(): config.storeName, config.logoUrl (vía StoreImage),
//     config.contactEmail/contactPhone, config.socialLinks,
//     config.legalIdentity.legalAddress (footer).
//   - useCart().count (badge de la canasta) y useAuth().isAuthenticated
//     (enlace a "Mi cuenta" vs. "Iniciar sesión").
import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

const AppShell = () => {
  const { pathname } = useLocation();

  // Cada cambio de ruta empieza arriba.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app-shell">
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default AppShell;
