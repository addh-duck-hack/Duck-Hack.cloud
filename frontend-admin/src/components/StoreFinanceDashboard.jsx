import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl, authHeaders, jsonHeaders, errorMessage, formatMxn, MONTH_LABELS } from "../utils/storeFinance";
import MonthlyBarChart from "./MonthlyBarChart";
import Alert from "./Alert";

const SOURCE_KEYS = ["orders", "giftCards", "deposits", "wholesale", "manual"];

const Figure = ({ label, value, tone }) => (
  <div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--placeholder-color)", textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", fontWeight: 700, color: tone === "bad" ? "var(--error-color)" : "var(--heading-color)" }}>
      {value === null || value === undefined ? "—" : formatMxn(value)}
    </div>
  </div>
);

// Resumen de la contabilidad de la tienda (GET /api/store-accounting/summary):
// saldo, ingresos (automáticos por fuente + manuales) vs gastos por mes, gastos
// por categoría, por cobrar (mayoreo) y por pagar (compras sin pagar).
const StoreFinanceDashboard = () => {
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [opening, setOpening] = useState(null);
  const [openingForm, setOpeningForm] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [s, o] = await Promise.all([
        axios.get(apiUrl("/api/store-accounting/summary"), { headers: authHeaders(), params: { year } }),
        axios.get(apiUrl("/api/store-accounting/opening-balance"), { headers: authHeaders() }),
      ]);
      setSummary(s.data);
      setOpening(o.data?.openingBalance || null);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar el resumen."));
    } finally {
      setIsLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const saveOpening = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await axios.post(apiUrl("/api/store-accounting/opening-balance"), { amount: Number(openingForm.amount || 0), date: openingForm.date || undefined }, { headers: jsonHeaders() });
      setMessage("Saldo inicial guardado.");
      setOpeningForm(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "No fue posible guardar el saldo inicial."));
    }
  };

  const months = (summary?.months || []).map((m, i) => ({ ...m, month: i + 1 }));
  const sourceLabel = (key) => (key === "manual" ? "Otros ingresos (manuales)" : summary?.sources?.[key] || key);
  const sourceTotals = SOURCE_KEYS.map((key) => [key, months.reduce((s, m) => s + (m.incomeBySource?.[key] || 0), 0)]).filter(([, total]) => total > 0);

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Contabilidad</h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button type="button" style={{ width: "auto" }} onClick={() => navigate("/admin/finance/movements")}>
            Ver movimientos
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: "auto" }}
            onClick={() =>
              setOpeningForm((f) =>
                f ? null : { amount: opening ? String(opening.signedAmount ?? opening.amount) : "", date: opening?.date ? opening.date.slice(0, 10) : "" }
              )
            }
          >
            Saldo inicial
          </button>
        </div>
      </div>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      {openingForm ? (
        <form onSubmit={saveOpening} style={{ maxWidth: 420, marginTop: "1rem" }}>
          <p style={{ fontSize: "0.9rem" }}>Lo que había en caja y bancos al empezar a usar este módulo. Negativo si la tienda arrancó debiendo; 0 lo quita.</p>
          <label>
            Saldo inicial (MXN)
            <input type="number" step="0.01" value={openingForm.amount} onChange={(e) => setOpeningForm((f) => ({ ...f, amount: e.target.value }))} required />
          </label>
          <label>
            Fecha (hoy si se deja vacío)
            <input type="date" value={openingForm.date} onChange={(e) => setOpeningForm((f) => ({ ...f, date: e.target.value }))} />
          </label>
          <button type="submit" style={{ width: "auto" }}>
            Guardar saldo inicial
          </button>
        </form>
      ) : null}

      {summary ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
          {summary.currentBalance !== null ? <Figure label="Saldo actual" value={summary.currentBalance} tone={summary.currentBalance < 0 ? "bad" : undefined} /> : null}
          <Figure label={`Ingresos ${year}`} value={summary.totals.income} />
          <Figure label={`Gastos ${year}`} value={summary.totals.expense} />
          <Figure label={`Neto ${year}`} value={summary.totals.net} tone={summary.totals.net < 0 ? "bad" : undefined} />
          {summary.receivable !== null ? (
            <Link to="/admin/wholesale/receivables" style={{ textDecoration: "none" }}>
              <Figure label="Por cobrar (mayoreo)" value={summary.receivable} />
            </Link>
          ) : null}
          <Link to="/admin/finance/purchases" style={{ textDecoration: "none" }}>
            <Figure label="Por pagar (compras)" value={summary.payable} tone={summary.payable > 0 ? "bad" : undefined} />
          </Link>
        </div>
      ) : null}

      <div style={{ marginTop: "2rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button type="button" className="btn-secondary" onClick={() => setYear((y) => y - 1)} style={{ width: "auto" }}>
          ← {year - 1}
        </button>
        <h4 style={{ margin: 0 }}>{year}</h4>
        <button type="button" className="btn-secondary" onClick={() => setYear((y) => y + 1)} style={{ width: "auto" }}>
          {year + 1} →
        </button>
        {isLoading ? <span style={{ fontSize: "0.8rem", color: "var(--placeholder-color)" }}>Cargando...</span> : null}
      </div>

      {summary ? (
        <>
          <div style={{ marginTop: "1rem" }}>
            <MonthlyBarChart months={months} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", marginTop: "1.5rem" }}>
            <div>
              <h4>Ingresos por fuente</h4>
              <table style={{ margin: 0 }}>
                <tbody>
                  {sourceTotals.length === 0 ? (
                    <tr>
                      <td>Sin ingresos este año.</td>
                    </tr>
                  ) : null}
                  {sourceTotals.map(([key, total]) => (
                    <tr key={key}>
                      <td>{sourceLabel(key)}</td>
                      <td style={{ textAlign: "right" }}>{formatMxn(total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h4>Gastos por categoría</h4>
              <table style={{ margin: 0 }}>
                <tbody>
                  {summary.expenseByCategory.length === 0 ? (
                    <tr>
                      <td>Sin gastos este año.</td>
                    </tr>
                  ) : null}
                  {summary.expenseByCategory.map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td style={{ textAlign: "right" }}>{formatMxn(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button type="button" className="btn-secondary" onClick={() => setShowTable((v) => !v)} style={{ marginTop: "1.5rem", width: "auto" }}>
            {showTable ? "Ocultar tabla mensual" : "Ver tabla mensual"}
          </button>
          {showTable ? (
            <table style={{ marginLeft: 0, marginRight: 0 }}>
              <thead>
                <tr>
                  <th>Mes</th>
                  {SOURCE_KEYS.map((key) => (
                    <th key={key}>{sourceLabel(key)}</th>
                  ))}
                  <th>Ingresos</th>
                  <th>Gastos</th>
                  <th>Neto</th>
                  <th>Saldo al cierre</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={SOURCE_KEYS.length + 4}>Saldo al iniciar {year}</td>
                  <td>{formatMxn(summary.openingBalance)}</td>
                </tr>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td>{MONTH_LABELS[m.month - 1]}</td>
                    {SOURCE_KEYS.map((key) => (
                      <td key={key}>{m.incomeBySource[key] ? formatMxn(m.incomeBySource[key]) : "—"}</td>
                    ))}
                    <td>{formatMxn(m.income)}</td>
                    <td>{formatMxn(m.expense)}</td>
                    <td>{formatMxn(m.net)}</td>
                    <td>{formatMxn(m.closingBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      ) : null}
    </section>
  );
};

export default StoreFinanceDashboard;
