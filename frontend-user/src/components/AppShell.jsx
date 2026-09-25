// src/components/AppShell.jsx
//
// Layout común de todas las rutas públicas: barra superior + página actual +
// llamado a la acción (CtaBanner) + footer. La barra flota sobre el hero de la página mientras está a la vista
// y pasa a sólida al bajar; ver hooks/useHero.jsx.
import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { HeroProvider, useHeroTracking } from '../hooks/useHero';
import TopBar from './TopBar';
import Footer from './Footer';
import CtaBanner from './CtaBanner';
import './AppShell.css';

// Alto de la barra (--topbar-height en index.css) + su margen flotante.
const TOPBAR_OFFSET = 82;

const AppShell = () => {
  const { pathname } = useLocation();
  const { heroRef, hasHero, isOverHero } = useHeroTracking(TOPBAR_OFFSET);

  // Cada cambio de ruta empieza arriba.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <HeroProvider heroRef={heroRef}>
      <div className="app-shell">
        <TopBar mode={hasHero && isOverHero ? 'floating' : 'solid'} />
        {/* Con hero, éste queda debajo de la barra (a sangre); sin hero, el
            contenido empieza después de la barra. */}
        <main className={hasHero ? 'app-main' : 'app-main app-main--offset'}>
          <Outlet />
        </main>
        <CtaBanner />
        <Footer />
      </div>
    </HeroProvider>
  );
};

export default AppShell;
