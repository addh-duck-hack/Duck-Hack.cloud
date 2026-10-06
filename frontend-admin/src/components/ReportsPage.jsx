import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { ORDER_STATUS_LABELS } from "../utils/orderStatusLabels";
import { APPOINTMENT_STATUS_LABELS } from "../utils/schedule";
import SeriesBarChart from "./SeriesBarChart";

// Reportes (módulo "reports"; backend packages/core-api/modules/reports.js):
// ventas de la tienda y citas del salón en un rango de fechas, con cifras,
// una gráfica por periodo, tablas y exportación a CSV. Cada sección solo
// aparece si su módulo está contratado (el backend manda null si no).

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const formatMxnPrecise = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const localDay = (offset = 0) => new Date(Date.now() + offset * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

const RANGES = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "12 meses", days: 365 },
];

// "2026-10-05" / "2026-10" → etiqueta corta y larga según la agrupación.
const periodLabels = (period, groupBy) => {
  if (groupBy === "month") {
    const d = new Date(`${period}-15T12:00:00Z`);
    return { short: d.toLocaleDateString("es-MX", { month: "short", timeZone: "UTC" }), label: d.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }) };
  }
  const d = new Date(`${period}T12:00:00Z`);
  const short = d.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
  return { short, label: groupBy === "week" ? `Semana del ${short}` : d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) };
};

const Stat = ({ label, value, hint }) => (
  <div style={{ padding: "0.9rem 1rem", border: "1px solid var(--input-border-color)", borderRadius: 8 }}>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--placeholder-color)", textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--heading-color)" }}>{value}</div>
    {hint ? <small style={{ color: "var(--placeholder-color)" }}>{hint}</small> : null}
  </div>
);

const StatGrid = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem", margin: "0.75rem 0 1.25rem" }}>{children}</div>
);

const Table = ({ head, rows, empty = "Sin datos en este rango." }) =>
  rows.length ? (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p style={{ color: "var(--placeholder-color)" }}>{empty}</p>
  );

const ReportsPage = () => {
  const [from, setFrom] = useState(localDay(-29));
  const [to, setTo] = useState(localDay(0));
  const [groupBy, setGroupBy] = useState("");
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data: summary } = await axios.get(`${baseUrl}/api/reports/summary`, { headers: getAuthHeaders(), params: { from, to, groupBy: groupBy || undefined } });
      setData(summary);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar el reporte.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, groupBy]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async (type) => {
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/reports/export`, { headers: getAuthHeaders(), params: { type, from, to }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${type === "appointments" ? "citas" : "pedidos"}-${from}-a-${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No fue posible exportar.");
    }
  };

  const setPreset = (days) => {
    setFrom(localDay(-(days - 1)));
    setTo(localDay(0));
  };

  const sales = data?.sales;
  const appts = data?.appointments;
  const by = data?.range?.groupBy || "day";
  const points = (series, key) => series.map((p) => ({ ...periodLabels(p.period, by), value: p[key] }));

  return (
    <section>
      <h3 style={{ margin: 0 }}>Reportes</h3>
      <p>Ventas de la tienda y citas del salón en el rango elegido (hora de la agenda). Las ventas cuentan los pedidos pagados por fecha de alta.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "end", marginBottom: "1rem" }}>
        {RANGES.map((r) => (
          <button key={r.days} type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => setPreset(r.days)}>
            {r.label}
          </button>
        ))}
        <label style={{ width: "auto" }}>
          Desde
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ width: "auto" }}>
          Hasta
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label style={{ width: "auto" }}>
          Agrupar
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="">Automático</option>
            <option value="day">Por día</option>
            <option value="week">Por semana</option>
            <option value="month">Por mes</option>
          </select>
        </label>
        {isLoading ? <span style={{ color: "var(--placeholder-color)" }}>Cargando...</span> : null}
      </div>
      {error ? <div className="auth-error">{error}</div> : null}

      {data && !sales && !appts ? <p>No hay módulos de ventas ni de citas contratados para reportar.</p> : null}

      {sales ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h4 style={{ margin: 0 }}>Ventas</h4>
            <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => exportCsv("orders")}>
              <i className="fas fa-file-csv" aria-hidden="true" /> Exportar pedidos
            </button>
          </div>
          <StatGrid>
            <Stat label="Ventas" value={formatMxn(sales.revenue)} hint={`${sales.orders} pedidos pagados`} />
            <Stat label="Ticket promedio" value={formatMxn(sales.avgTicket)} />
            <Stat label="Piezas vendidas" value={sales.itemsSold} />
            <Stat label="Clientes" value={sales.customers.total} hint={`${sales.customers.new} nuevos · ${sales.customers.returning} recurrentes`} />
            <Stat label="Descuentos" value={formatMxn(sales.discounts + sales.pointsRedeemed)} hint={`Cupones ${formatMxn(sales.discounts)} · Puntos ${formatMxn(sales.pointsRedeemed)}`} />
            {sales.giftCardPaid ? <Stat label="Pagado con tarjetas" value={formatMxn(sales.giftCardPaid)} /> : null}
          </StatGrid>
          <SeriesBarChart points={points(sales.series, "revenue")} format={formatMxn} ariaLabel="Ventas por periodo" />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginTop: "1.25rem" }}>
            <div>
              <h4>Productos más vendidos</h4>
              <Table head={["Producto", "Piezas", "Venta"]} rows={sales.topProducts.map((p) => [p.name, p.quantity, formatMxnPrecise(p.revenue)])} />
            </div>
            <div>
              <h4>Pedidos por estado</h4>
              <Table
                head={["Estado", "Pedidos"]}
                rows={sales.byStatus.map((s) => [ORDER_STATUS_LABELS[s.status]?.label || s.status, s.count])}
              />
              {sales.coupons.length ? (
                <>
                  <h4>Cupones</h4>
                  <Table head={["Cupón", "Usos", "Descuento"]} rows={sales.coupons.map((c) => [c.code, c.uses, formatMxnPrecise(c.discount)])} />
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {appts ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginTop: "2rem" }}>
            <h4 style={{ margin: 0 }}>Citas</h4>
            <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => exportCsv("appointments")}>
              <i className="fas fa-file-csv" aria-hidden="true" /> Exportar citas
            </button>
          </div>
          <StatGrid>
            <Stat label="Citas" value={appts.total} hint={`${appts.completed} completadas`} />
            <Stat label="Ingresos de citas" value={formatMxn(appts.revenue)} hint="De las completadas" />
            <Stat label="Cancelación" value={`${appts.cancellationRate}%`} />
            <Stat label="No asistió" value={`${appts.noShowRate}%`} />
            {appts.depositsCollected ? <Stat label="Anticipos cobrados" value={formatMxn(appts.depositsCollected)} /> : null}
          </StatGrid>
          <SeriesBarChart points={points(appts.series, "appointments")} format={(n) => String(Math.round(n))} ariaLabel="Citas por periodo" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginTop: "1.25rem" }}>
            <div>
              <h4>Por especialista</h4>
              <Table
                head={["Especialista", "Citas", "Completadas", "Canceladas", "No asistió", "Ingresos"]}
                rows={appts.bySpecialist.map((s) => [s.name, s.total, s.completed, s.cancelled, s.noShow, formatMxnPrecise(s.revenue)])}
              />
            </div>
            <div>
              <h4>Servicios más pedidos</h4>
              <Table head={["Servicio", "Veces", "Ingresos"]} rows={appts.byService.map((s) => [s.name, s.count, formatMxnPrecise(s.revenue)])} />
              <h4>Citas por estado</h4>
              <Table head={["Estado", "Citas"]} rows={appts.byStatus.map((s) => [APPOINTMENT_STATUS_LABELS[s.status] || s.status, s.count])} />
            </div>
          </div>
        </>
      ) : null}

      {data?.giftCards || data?.loyalty ? (
        <>
          <h4 style={{ marginTop: "2rem" }}>Tarjetas de regalo y lealtad</h4>
          <StatGrid>
            {data.giftCards ? (
              <>
                <Stat label="Tarjetas vendidas" value={formatMxn(data.giftCards.soldAmount)} hint={`${data.giftCards.soldCount} tarjetas`} />
                <Stat label="Canjeado con tarjetas" value={formatMxn(data.giftCards.redeemed)} />
                <Stat label="Saldo por canjear" value={formatMxn(data.giftCards.outstandingBalance)} hint={`${data.giftCards.activeCards} activas (hoy)`} />
              </>
            ) : null}
            {data.loyalty ? (
              <>
                <Stat label="Puntos ganados" value={formatMxn(data.loyalty.pointsEarned)} />
                <Stat label="Puntos usados" value={formatMxn(data.loyalty.pointsRedeemed)} />
                <Stat label="Sellos" value={data.loyalty.stampsEarned} hint={`${data.loyalty.rewardsRedeemed} premios canjeados`} />
              </>
            ) : null}
          </StatGrid>
        </>
      ) : null}
    </section>
  );
};

export default ReportsPage;
