import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import MonthlyBarChart from "./MonthlyBarChart";

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const formatMxn = (value) =>
  Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const AccountingDashboard = () => {
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showTable, setShowTable] = useState(false);

  const [showOpeningBalanceForm, setShowOpeningBalanceForm] = useState(false);
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/accounting/summary`, {
        headers: getAuthHeaders(),
        params: { year },
      });
      setSummary(response.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar el resumen de contabilidad.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleOpeningBalanceSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await axios.post(
        `${baseUrl}/api/accounting/opening-balance`,
        { amount: Number(openingBalanceAmount), date: openingBalanceDate || undefined },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setMessage("Saldo inicial configurado.");
      setShowOpeningBalanceForm(false);
      setOpeningBalanceAmount("");
      setOpeningBalanceDate("");
      await loadSummary();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible configurar el saldo inicial.");
    }
  };

  return (
    <section style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Contabilidad</h3>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="button" onClick={() => navigate("/admin/accounting/transactions")} style={{ width: "auto" }}>
            Ver movimientos
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowOpeningBalanceForm((v) => !v)}
          >
            Configurar saldo inicial
          </button>
        </div>
      </div>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      {showOpeningBalanceForm ? (
        <form onSubmit={handleOpeningBalanceSubmit} style={{ maxWidth: 400, marginTop: "1rem" }}>
          <label>
            Saldo inicial (MXN)
            <input
              type="number"
              min="0"
              step="0.01"
              value={openingBalanceAmount}
              onChange={(e) => setOpeningBalanceAmount(e.target.value)}
              required
            />
          </label>
          <label>
            Fecha (opcional, hoy si se deja vacío)
            <input type="date" value={openingBalanceDate} onChange={(e) => setOpeningBalanceDate(e.target.value)} />
          </label>
          <button type="submit">Guardar saldo inicial</button>
        </form>
      ) : null}

      {/* Saldo actual — figura hero única de esta vista */}
      <div style={{ marginTop: "2rem" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--placeholder-color)", textTransform: "uppercase" }}>
          Saldo actual
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "2.75rem", fontWeight: 700, color: "var(--heading-color)" }}>
          {summary ? formatMxn(summary.currentBalance) : "—"}
        </div>
      </div>

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
            <MonthlyBarChart months={summary.months} />
          </div>

          <button type="button" className="btn-secondary" onClick={() => setShowTable((v) => !v)} style={{ marginTop: "1rem", width: "auto" }}>
            {showTable ? "Ocultar tabla" : "Ver como tabla"}
          </button>

          {showTable ? (
            <table style={{ marginLeft: 0, marginRight: 0 }}>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Ingresos</th>
                  <th>Egresos</th>
                  <th>Neto</th>
                </tr>
              </thead>
              <tbody>
                {summary.months.map((m) => (
                  <tr key={m.month}>
                    <td>{MONTH_LABELS[m.month - 1]}</td>
                    <td>{formatMxn(m.income)}</td>
                    <td>{formatMxn(m.expense)}</td>
                    <td>{formatMxn(m.income - m.expense)}</td>
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

export default AccountingDashboard;
