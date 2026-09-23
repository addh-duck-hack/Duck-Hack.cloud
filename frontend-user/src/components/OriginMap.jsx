// src/components/OriginMap.jsx
//
// Mapa de puntos del municipio de Xicotepec (Puebla). El contorno es un trazo
// aproximado del límite municipal en el mapa de referencia; se rellena con
// puntos del color acento que se desvanecen hacia abajo, más un punto
// destacado sobre Xicotepec de Juárez. Alrededor, una trama tenue de puntos
// (patrón SVG, no miles de <circle>) que se desvanece hacia los bordes llena
// la tarjeta. Puramente decorativo.
import React, { useMemo } from 'react';

// Contorno en coordenadas del mapa de referencia (469×363 px), en sentido
// horario desde el extremo oeste.
const OUTLINE = [
  [0, 188], [30, 192], [55, 212], [80, 220], [100, 212], [120, 195], [145, 170], [155, 150],
  [170, 130], [185, 110], [192, 90], [215, 78], [240, 68], [250, 62], [262, 72], [270, 85],
  [300, 82], [320, 82], [335, 72], [355, 55], [380, 45], [410, 38], [440, 30], [462, 22],
  [468, 38], [460, 55], [448, 80], [435, 105], [418, 125], [400, 145], [385, 160], [365, 170],
  [345, 175], [330, 185], [328, 205], [312, 222], [298, 238], [290, 255], [285, 275],
  [278, 295], [268, 312], [245, 318], [222, 320], [200, 326], [175, 330], [150, 328],
  [125, 326], [100, 320], [80, 310], [68, 295], [60, 282], [52, 268], [70, 262], [72, 250],
  [55, 242], [40, 230], [28, 215], [15, 200],
];

// Xicotepec de Juárez (cabecera municipal) en las mismas coordenadas.
const TOWN_CENTER = [125, 252];

const STEP = 10;
const DOT_R = 2.8;
const PAD = 20;

const xs = OUTLINE.map(([x]) => x);
const ys = OUTLINE.map(([, y]) => y);
const TOWN = {
  minX: Math.min(...xs),
  minY: Math.min(...ys),
  maxX: Math.max(...xs),
  maxY: Math.max(...ys),
};

// Lienzo apaisado (≈2.4:1). El municipio va pegado a la izquierda: su hueco
// de abajo a la derecha más el espacio libre del lienzo dejan lugar para el
// texto de la tarjeta sin taparlo.
const VIEW_H = TOWN.maxY - TOWN.minY + PAD * 2;
const VIEW_W = VIEW_H * 2.4;
const VIEW_X = TOWN.minX - PAD;
const VIEW_Y = TOWN.minY - PAD;
// Centro de la trama exterior: el centro de la silueta.
const FADE_CENTER = [(TOWN.minX + TOWN.maxX) / 2, (TOWN.minY + TOWN.maxY) / 2];

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
      const fade = 1 - ((y - TOWN.minY) / height) * 0.6; // más tenue hacia abajo
      dots.push({ x, y, opacity: Math.max(0.2, fade * (0.45 + noise(x, y) * 0.55)) });
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
        <radialGradient
          id="origin-fade"
          gradientUnits="userSpaceOnUse"
          cx={FADE_CENTER[0]}
          cy={FADE_CENTER[1]}
          r={VIEW_W * 0.55}
        >
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

      <circle cx={cx} cy={cy} r={11} fill="var(--color-accent)" opacity={0.18} />
      <circle cx={cx} cy={cy} r={5.5} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={2} />
    </svg>
  );
};

export default OriginMap;
