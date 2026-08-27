import React, { useRef, useState } from "react";

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Paleta validada con scripts/validate_palette.js (skill dataviz) contra la
// superficie oscura de este panel (#0d2130): pasa lightness band, chroma,
// separación CVD (ΔE 26.8 protan / 32.4 tritan) y contraste — son los slots
// 1 y 2 del set de referencia, no un color elegido a ojo.
const COLOR_INCOME = "#3987e5";
const COLOR_EXPENSE = "#d95926";

const GRID_COLOR = "var(--input-border-color)";
const AXIS_TEXT_COLOR = "var(--placeholder-color)";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const currencyFormatterPrecise = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

// Algoritmo estándar de "nice numbers" para topes de eje (Heckbert) — evita
// topes raros como "$1,847" y da ticks redondos (100/200/500/1000...).
const niceCeil = (value) => {
  if (!(value > 0)) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  let niceNormalized;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
};

// Path con esquinas superiores redondeadas y base cuadrada (anclada a la
// línea base) — spec de la skill dataviz para barras/columnas.
const roundedTopRectPath = (x, y, w, h, r) => {
  if (h <= 0) return "";
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
};

/**
 * Gráfico de barras agrupadas ingreso/egreso por mes.
 * @param {{month:number, income:number, expense:number}[]} months
 */
const MonthlyBarChart = ({ months }) => {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const width = 760;
  const height = 300;
  const margin = { top: 16, right: 16, bottom: 28, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const maxRaw = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));
  const axisMax = niceCeil(maxRaw * 1.15);
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (axisMax / tickCount) * i);

  const bandWidth = plotWidth / months.length;
  const barWidth = Math.min(20, (bandWidth - 12) / 2);
  const barGap = 3; // hueco de superficie entre las dos barras del mismo mes

  const yFor = (value) => plotHeight - (value / axisMax) * plotHeight;

  const showTooltip = (e, label, value, color) => {
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, label, value, color });
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Leyenda — obligatoria con 2+ series, es el canal de identidad confiable */}
      <div style={{ display: "flex", gap: "1.25rem", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-color)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_INCOME, display: "inline-block" }} />
          Ingresos
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-color)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_EXPENSE, display: "inline-block" }} />
          Egresos
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Ingresos y egresos por mes">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Gridlines horizontales — hairline, recesivas */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={0} x2={plotWidth} y1={yFor(tick)} y2={yFor(tick)} stroke={GRID_COLOR} strokeWidth={1} />
              <text x={-8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={AXIS_TEXT_COLOR}>
                {currencyFormatter.format(tick)}
              </text>
            </g>
          ))}

          {/* Línea base */}
          <line x1={0} x2={plotWidth} y1={plotHeight} y2={plotHeight} stroke={GRID_COLOR} strokeWidth={1} />

          {months.map((m, i) => {
            const bandX = i * bandWidth;
            const pairWidth = barWidth * 2 + barGap;
            const startX = bandX + (bandWidth - pairWidth) / 2;
            const incomeH = (m.income / axisMax) * plotHeight;
            const expenseH = (m.expense / axisMax) * plotHeight;

            return (
              <g key={m.month}>
                <path
                  d={roundedTopRectPath(startX, plotHeight - incomeH, barWidth, incomeH, 4)}
                  fill={COLOR_INCOME}
                  onMouseEnter={(e) => showTooltip(e, `${MONTH_LABELS[m.month - 1]} · Ingresos`, m.income, COLOR_INCOME)}
                  onMouseMove={(e) => showTooltip(e, `${MONTH_LABELS[m.month - 1]} · Ingresos`, m.income, COLOR_INCOME)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: "pointer" }}
                />
                <path
                  d={roundedTopRectPath(startX + barWidth + barGap, plotHeight - expenseH, barWidth, expenseH, 4)}
                  fill={COLOR_EXPENSE}
                  onMouseEnter={(e) => showTooltip(e, `${MONTH_LABELS[m.month - 1]} · Egresos`, m.expense, COLOR_EXPENSE)}
                  onMouseMove={(e) => showTooltip(e, `${MONTH_LABELS[m.month - 1]} · Egresos`, m.expense, COLOR_EXPENSE)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: "pointer" }}
                />
                <text x={bandX + bandWidth / 2} y={plotHeight + 18} textAnchor="middle" fontSize={10} fill={AXIS_TEXT_COLOR}>
                  {MONTH_LABELS[m.month - 1]}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {tooltip ? (
        <div
          className="chart-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
        >
          <span className="chart-tooltip-dot" style={{ background: tooltip.color }} />
          <strong>{tooltip.label}</strong>
          <span>{currencyFormatterPrecise.format(tooltip.value)}</span>
        </div>
      ) : null}
    </div>
  );
};

export default MonthlyBarChart;
