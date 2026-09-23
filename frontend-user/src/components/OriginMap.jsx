// src/components/OriginMap.jsx
//
// Mapa de puntos de Xicotepec de Juárez (Puebla). El contorno es un trazo
// aproximado del límite urbano en el mapa de referencia; se rellena con puntos
// del color acento que se desvanecen hacia abajo, más un punto destacado en el
// centro del pueblo. Alrededor, una trama tenue de puntos (patrón SVG, no
// miles de <circle>) que se desvanece hacia los bordes llena la tarjeta.
// Puramente decorativo.
import React, { useMemo } from 'react';

// Contorno en coordenadas del mapa de referencia (796×789 px).
const OUTLINE = [
  [320, 100], [345, 95], [380, 75], [420, 62], [455, 45], [470, 60], [500, 75], [520, 95],
  [525, 120], [515, 140], [520, 160], [535, 180], [540, 210], [545, 240], [540, 270],
  [548, 300], [545, 330], [540, 365], [530, 395], [530, 420], [525, 445], [500, 440],
  [490, 450], [475, 470], [455, 490], [420, 475], [405, 495], [395, 520], [380, 540],
  [385, 560], [380, 590], [375, 620], [360, 640], [365, 660], [370, 690], [350, 700],
  [345, 720], [330, 740], [305, 745], [290, 740], [275, 720], [250, 695], [270, 670],
  [265, 650], [285, 640], [280, 610], [270, 590], [280, 560], [270, 530], [280, 500],
  [270, 470], [275, 420], [250, 430], [220, 425], [195, 370], [180, 320], [180, 280],
  [185, 250], [205, 220], [225, 200], [230, 170], [260, 160], [275, 130], [295, 120],
];

// Centro (Col. Centro) en las mismas coordenadas.
const TOWN_CENTER = [400, 300];

const STEP = 16;
const DOT_R = 4.2;
const PAD = 24;

const xs = OUTLINE.map(([x]) => x);
const ys = OUTLINE.map(([, y]) => y);
const TOWN = {
  minX: Math.min(...xs),
  minY: Math.min(...ys),
  maxX: Math.max(...xs),
  maxY: Math.max(...ys),
};

// Lienzo apaisado (≈2.4:1) con el pueblo en el tercio izquierdo; el lado
// derecho queda libre para el texto de la tarjeta.
const VIEW_H = TOWN.maxY - TOWN.minY + PAD * 2;
const VIEW_W = VIEW_H * 2.4;
const VIEW_X = (TOWN.minX + TOWN.maxX) / 2 - VIEW_W * 0.3;
const VIEW_Y = TOWN.minY - PAD;

// Ray casting: ¿el punto cae dentro del contorno?
const isInside = (x, y) => {
  let inside = false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i, i += 1) {
    const [xi, yi] = OUTLINE[i];
    const [xj, yj] = OUTLINE[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// Ruido determinista (mismo resultado en cada render) para variar la opacidad.
const noise = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// La cuadrícula parte de VIEW_X/VIEW_Y para coincidir con el patrón exterior.
const buildTownDots = () => {
  const dots = [];
  const height = TOWN.maxY - TOWN.minY;
  for (let row = 0, y = VIEW_Y; y <= TOWN.maxY; row += 1, y += STEP) {
    if (y < TOWN.minY) continue;
    const offset = row % 2 ? STEP / 2 : 0; // filas desfasadas: trama más orgánica
    for (let x = VIEW_X + offset; x <= TOWN.maxX; x += STEP) {
      if (x < TOWN.minX || !isInside(x, y)) continue;
      const fade = 1 - ((y - TOWN.minY) / height) * 0.7; // más tenue hacia abajo
      dots.push({ x, y, opacity: Math.max(0.18, fade * (0.4 + noise(x, y) * 0.6)) });
    }
  }
  return dots;
};

const OriginMap = ({ className = '' }) => {
  const dots = useMemo(buildTownDots, []);
  const [cx, cy] = TOWN_CENTER;

  return (
    <svg
      className={className}
      viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMinYMid slice"
      role="img"
      aria-label="Mapa de Xicotepec de Juárez"
    >
      <defs>
        <pattern
          id="origin-dots"
          patternUnits="userSpaceOnUse"
          x={VIEW_X}
          y={VIEW_Y}
          width={STEP}
          height={STEP * 2}
        >
          <circle cx={0} cy={0} r={DOT_R} />
          <circle cx={STEP} cy={0} r={DOT_R} />
          <circle cx={STEP / 2} cy={STEP} r={DOT_R} />
        </pattern>
        <radialGradient id="origin-fade" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={VIEW_W * 0.55}>
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="origin-mask">
          <rect x={VIEW_X} y={VIEW_Y} width={VIEW_W} height={VIEW_H} fill="url(#origin-fade)" />
        </mask>
      </defs>

      <g fill="var(--color-accent)" opacity={0.16} mask="url(#origin-mask)">
        <rect x={VIEW_X} y={VIEW_Y} width={VIEW_W} height={VIEW_H} fill="url(#origin-dots)" />
      </g>

      <g fill="var(--color-accent)">
        {dots.map((d) => (
          <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={DOT_R} opacity={d.opacity} />
        ))}
      </g>

      <circle cx={cx} cy={cy} r={16} fill="var(--color-accent)" opacity={0.18} />
      <circle cx={cx} cy={cy} r={8} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={3} />
    </svg>
  );
};

export default OriginMap;
