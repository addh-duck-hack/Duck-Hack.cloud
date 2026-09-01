import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { SOURCE_LABELS, formatMxn } from "../utils/accountingLabels";

const formatDate = (value) => formatCalendarDate(value) || "—";

// Mismo criterio de "mes calendario" que el backend (backend/routes/invoices.routes.js
// #monthKeyUTC) — UTC, no la zona horaria del navegador, para que agrupar acá
// coincida exactamente con lo que el servidor va a validar.
const monthKeyUTC = (dateString) => {
  const date = new Date(dateString);
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
};

const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (dateString) => MONTH_YEAR_FORMAT.format(new Date(dateString));

const InvoiceForm = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [movements, setMovements] = useState([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [concept, setConcept] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    const loadClients = async () => {
      try {
        const response = await axios.get(`${baseUrl}/api/agency-clients`, { headers: getAuthHeaders() });
        setClients(response.data?.items || []);
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar los clientes.");
      }
    };
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMovements = useCallback(async (client) => {
    setIsLoadingMovements(true);
    setError("");
    setSelectedMonthKey("");
    setSelectedIds([]);
    setConcept("");
    try {
      const response = await axios.get(`${baseUrl}/api/accounting/transactions`, {
        headers: getAuthHeaders(),
        params: { client, type: "income", invoiced: "false" },
      });
      setMovements(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los movimientos del cliente.");
      setMovements([]);
    } finally {
      setIsLoadingMovements(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClientChange = (event) => {
    const value = event.target.value;
    setClientId(value);
    if (value) loadMovements(value);
    else {
      setMovements([]);
      setSelectedMonthKey("");
      setSelectedIds([]);
    }
  };

  // Movimientos pendientes agrupados por mes calendario (UTC) — cada grupo es
  // seleccionable de forma independiente, nunca mezclado con otro mes.
  const monthGroups = useMemo(() => {
    const groups = new Map();
    for (const m of movements) {
      const key = monthKeyUTC(m.date);
      if (!groups.has(key)) groups.set(key, { key, label: monthLabel(m.date), items: [] });
      groups.get(key).items.push(m);
    }
    return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [movements]);

  const activeGroup = monthGroups.find((g) => g.key === selectedMonthKey) || null;

  const handleMonthChange = (event) => {
    setSelectedMonthKey(event.target.value);
    setSelectedIds([]);
    setConcept("");
  };

  const toggleMovement = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedMovements = useMemo(
    () => (activeGroup ? activeGroup.items.filter((m) => selectedIds.includes(m._id)) : []),
    [activeGroup, selectedIds]
  );
  const total = selectedMovements.reduce((sum, m) => sum + m.amount, 0);

  const defaultConcept = useMemo(() => {
    if (selectedMovements.length === 0) return "";
    const categories = [...new Set(selectedMovements.map((m) => m.category).filter(Boolean))];
    const label = categories.length > 0 ? categories.join(", ") : "Movimientos";
    return `${label} - ${activeGroup?.label || ""}`;
  }, [selectedMovements, activeGroup]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (selectedIds.length === 0) {
      setError("Selecciona al menos un movimiento.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await axios.post(
        `${baseUrl}/api/invoices`,
        { client: clientId, transactionIds: selectedIds, concept: concept.trim() || undefined },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      navigate("/admin/invoices");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible crear la factura.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <h3>Facturar movimientos</h3>
      <p>Selecciona uno o más movimientos del mismo cliente y mismo mes para facturarlos juntos. El folio se asigna automáticamente.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: 700, margin: 0 }}>
        <label>
          Cliente
          <select value={clientId} onChange={handleClientChange} required>
            <option value="">Selecciona un cliente</option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.businessName}
              </option>
            ))}
          </select>
        </label>

        {clientId && isLoadingMovements ? <p>Cargando movimientos...</p> : null}

        {clientId && !isLoadingMovements && monthGroups.length === 0 ? (
          <p>Este cliente no tiene movimientos pendientes de facturar.</p>
        ) : null}

        {monthGroups.length > 0 ? (
          <label>
            Mes
            <select value={selectedMonthKey} onChange={handleMonthChange} required>
              <option value="">Selecciona un mes</option>
              {monthGroups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label} ({g.items.length} movimiento{g.items.length === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {activeGroup ? (
          <>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Origen</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {activeGroup.items.map((m) => (
                  <tr key={m._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(m._id)}
                        onChange={() => toggleMovement(m._id)}
                      />
                    </td>
                    <td>{formatDate(m.date)}</td>
                    <td>{m.category || "—"}</td>
                    <td>{SOURCE_LABELS[m.source] || m.source}</td>
                    <td>{formatMxn(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <label>
              Concepto (opcional — se compone automáticamente si se deja vacío)
              <input
                type="text"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder={defaultConcept}
              />
            </label>

            <p>
              <strong>Total seleccionado: {formatMxn(total)}</strong> ({selectedIds.length} movimiento
              {selectedIds.length === 1 ? "" : "s"})
            </p>
          </>
        ) : null}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isSubmitting || selectedIds.length === 0} style={{ width: "auto" }}>
            {isSubmitting ? "Generando..." : "Generar factura"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/invoices")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default InvoiceForm;
