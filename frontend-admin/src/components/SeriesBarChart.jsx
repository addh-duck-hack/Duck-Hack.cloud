import React, { useRef, useState } from "react";
import { niceCeil, roundedTopRectPath } from "./MonthlyBarChart";

// Barras de UNA serie por periodo (Reportes: ventas o citas por día, semana o
// mes). Mismo estilo que MonthlyBarChart.jsx: azul de la paleta validada
// (slot 1, contra la superficie oscura del panel), puntas redondeadas de 4px
// ancladas a la línea base, rejilla recesiva y tooltip por barra. Una sola
// serie no lleva leyenda: el título de la tarjeta la nombra. Con muchos
// periodos solo se rotulan algunos en el eje (el tooltip da el exacto).

const COLOR = "#3987e5";
const GRID_COLOR = "var(--input-border-color)";
const AXIS_TEXT_COLOR = "var(--placeholder-color)";

/**
 * @param {{ label: string, value: number }[]} points
 * @param {(n: number) => string} format - formato del valor (moneda, conteo…)
 * @param {string} ariaLabel
 */
const SeriesBarChart = ({ points, format = (n) => String(n), ariaLabel }) => {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const width = 760;
  const height = 240;
  const margin = { top: 12, right: 12, bottom: 28, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const axisMax = niceCeil(Math.max(1, ...points.map((p) => p.value)) * 1.15);
  const ticks = Array.from({ length: 5 }, (_, i) => (axisMax / 4) * i);
  const bandWidth = plotWidth / Math.max(1, points.length);
  const barWidth = Math.max(2, Math.min(28, bandWidth - Math.max(2, bandWidth * 0.3)));
  const labelEvery = Math.ceil(points.length / 12);
  const yFor = (value) => plotHeight - (value / axisMax) * plotHeight;

  const show = (e, point) => {
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, point });
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={0} x2={plotWidth} y1={yFor(tick)} y2={yFor(tick)} stroke={GRID_COLOR} strokeWidth={1} />
              <text x={-8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={AXIS_TEXT_COLOR}>
                {format(tick)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const h = (p.value / axisMax) * plotHeight;
            const x = i * bandWidth + (bandWidth - barWidth) / 2;
            return (
              <g key={p.label}>
                {/* Zona de hover más grande que la barra (toda la columna). */}
                <rect
                  x={i * bandWidth}
                  y={0}
                  width={bandWidth}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={(e) => show(e, p)}
                  onMouseMove={(e) => show(e, p)}
                  onMouseLeave={() => setTooltip(null)}
                />
                <path d={roundedTopRectPath(x, plotHeight - h, barWidth, h, 4)} fill={COLOR} pointerEvents="none" />
                {i % labelEvery === 0 ? (
                  <text x={i * bandWidth + bandWidth / 2} y={plotHeight + 18} textAnchor="middle" fontSize={10} fill={AXIS_TEXT_COLOR}>
                    {p.short || p.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={0} x2={plotWidth} y1={plotHeight} y2={plotHeight} stroke={GRID_COLOR} strokeWidth={1} />
        </g>
      </svg>
      {tooltip ? (
        <div className="chart-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}>
          <span className="chart-tooltip-dot" style={{ background: COLOR }} />
          <strong>{tooltip.point.label}</strong>
          <span>{format(tooltip.point.value)}</span>
          {tooltip.point.detail ? <span>{tooltip.point.detail}</span> : null}
        </div>
      ) : null}
    </div>
  );
};

export default SeriesBarChart;
