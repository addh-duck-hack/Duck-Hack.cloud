// src/components/BrandMarks.jsx
//
// Definiciones SVG de la marca Café Tacita, montadas una sola vez (en AppShell).
// El resto de los componentes las usan con <svg><use href="#id" /></svg>:
//   #campesino  — ilustración de línea inspirada en el sello (motivo recurrente).
//                 PROVISIONAL: se reemplaza por el arte real de la marca.
//   #ic-bag / #ic-ground / #ic-special / #ic-acc — íconos de categoría de tienda.
import React from 'react';

// Mapa categoría de producto -> id de símbolo. `iconForCategory` cae a #ic-bag
// para cualquier categoría que el admin cree y no esté en esta lista.
export const CATEGORY_ICONS = {
  'Café en grano': 'ic-bag',
  'Café molido': 'ic-ground',
  'Ediciones especiales': 'ic-special',
  Accesorios: 'ic-acc',
};

export const iconForCategory = (category) => CATEGORY_ICONS[category] || 'ic-bag';

// Sello redondo reutilizable (nav, hero, confirmaciones): disco teal con doble
// filete y la ilustración del campesino centrada.
export const BrandSeal = ({ className = '', symbol = 'campesino' }) => (
  <span className={`brand-seal ${className}`.trim()} aria-hidden="true">
    <svg viewBox="0 0 100 100">
      <use href={`#${symbol}`} />
    </svg>
  </span>
);

const BrandMarks = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
    <defs>
      <symbol id="campesino" viewBox="0 0 100 100">
        <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M30 34 q20 -16 40 0 q-6 -3 -20 -3 q-14 0 -20 3z" />
          <ellipse cx="50" cy="30" rx="10" ry="9" />
          <path d="M42 33 q8 6 16 0" />
          <path d="M40 40 q10 8 20 0 l3 20 q-13 8 -26 0z" />
          <path d="M40 46 q-8 6 -6 20 M60 46 q8 6 6 20" />
          <path d="M34 66 q16 10 32 0 q-4 8 -16 8 q-12 0 -16 -8z" />
          <circle cx="44" cy="70" r="1.6" fill="currentColor" />
          <circle cx="50" cy="72" r="1.6" fill="currentColor" />
          <circle cx="56" cy="70" r="1.6" fill="currentColor" />
        </g>
      </symbol>
      <symbol id="ic-bag" viewBox="0 0 100 100">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
          <path d="M30 32 L36 22 H64 L70 32 V86 A3 3 0 0 1 67 89 H33 A3 3 0 0 1 30 86 Z" />
          <path d="M36 22 l4 8 M64 22 l-4 8" />
          <rect x="38" y="48" width="24" height="16" rx="2" />
        </g>
      </symbol>
      <symbol id="ic-ground" viewBox="0 0 100 100">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
          <path d="M28 36 H72 L68 88 A3 3 0 0 1 65 91 H35 A3 3 0 0 1 32 88 Z" />
          <ellipse cx="50" cy="36" rx="22" ry="6" />
          <path d="M40 33 h1 M48 35 h1 M56 32 h1" />
        </g>
      </symbol>
      <symbol id="ic-special" viewBox="0 0 100 100">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
          <path d="M32 30 L38 20 H62 L68 30 V84 A3 3 0 0 1 65 87 H35 A3 3 0 0 1 32 84 Z" />
          <path d="M50 42 l3 7 8 1 -6 5.5 1.5 8 -6.5 -4 -6.5 4 1.5 -8 -6 -5.5 8 -1z" />
        </g>
      </symbol>
      <symbol id="ic-acc" viewBox="0 0 100 100">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
          <rect x="35" y="26" width="30" height="48" rx="4" />
          <path d="M32 22 h36 M65 42 h9 a6 6 0 0 1 0 12 h-9" />
        </g>
      </symbol>
    </defs>
  </svg>
);

export default BrandMarks;
