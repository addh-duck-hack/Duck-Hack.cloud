// src/hooks/useHero.jsx
//
// Conecta el hero de una página con la barra superior (TopBar). Mientras el
// hero está a la vista, la barra flota sobre él (margen de 10px, fondo
// translúcido); al bajar más allá del hero pasa a 100% de ancho con el color
// primario. Una página SIN hero (tienda, carrito, cuenta...) muestra la barra
// sólida desde el inicio.
//
// Uso en una página: `const heroRef = useHeroRef();` y `<section ref={heroRef}>`.
import React, { createContext, useContext, useLayoutEffect, useState } from 'react';

const HeroContext = createContext(() => {});

// Devuelve { heroRef, hasHero, isOverHero } — heroRef se pasa al contexto
// para que las páginas lo usen como callback ref. `topOffset` es la altura de
// la barra: el hero cuenta como "a la vista" mientras su borde inferior quede
// por debajo de ella.
//
// Se mide con scroll/resize (no IntersectionObserver) para que el estado sea
// correcto desde el primer pintado — IntersectionObserver responde tarde (y
// nada en pestañas en segundo plano), lo que hacía parpadear la barra al cargar.
export const useHeroTracking = (topOffset) => {
  const [heroEl, setHeroEl] = useState(null);
  const [isOverHero, setIsOverHero] = useState(false);

  useLayoutEffect(() => {
    if (!heroEl) {
      setIsOverHero(false);
      return undefined;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      setIsOverHero(heroEl.getBoundingClientRect().bottom > topOffset);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [heroEl, topOffset]);

  return { heroRef: setHeroEl, hasHero: Boolean(heroEl), isOverHero };
};

export const HeroProvider = ({ heroRef, children }) => (
  <HeroContext.Provider value={heroRef}>{children}</HeroContext.Provider>
);

export const useHeroRef = () => useContext(HeroContext);
