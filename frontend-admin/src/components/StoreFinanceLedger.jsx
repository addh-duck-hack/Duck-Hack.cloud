import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { apiUrl, authHeaders, jsonHeaders, errorMessage, formatMxn, formatDate, todayInput, PAYMENT_METHOD_LABELS } from "../utils/storeFinance";
import Alert from "./Alert";

const monthStart = () => `${todayInput().slice(0, 8)}01`;
const initialForm = { type: "expense", amount: "", date: "", category: "", description: "", paymentMethod: "" };

// Liga del origen de un renglón automático o de compra.
const sourceLink = (row) => {
  if (row.refKind === "Order") return `/admin/orders/${row.refId}`;
  if (row.refKind === "GiftCard") return `/admin/gift-cards/${row.refId}`;
  if (row.refKind === "Appointment") return `/admin/appointments/${row.refId}`;
  if (row.refKind === "WholesaleSale") return `/admin/wholesale/sales/${row.refId}`;
  if (row.source === "purchase" && row.sourceId) return `/admin/finance/purchases/${row.sourceId}`;
  return null;
};

// Movimientos de la contabilidad de la tienda: los manuales (editables) más
// los automáticos (ventas, tarjetas, anticipos, abonos de mayoreo) y los
// gastos de compras, que se editan desde su origen.
const StoreFinanceLedger = () => {
  const [filters, setFilters] = useState({ from: monthStart(), to: todayInput(), type: "", automatic: "" });
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = { from: filters.from, to: filters.to, type: filters.type || undefined, automatic: filters.automatic || undefined };
      const response = await axios.get(apiUrl("/api/store-accounting/ledger"), { headers: authHeaders(), params });
      setData(response.data);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar los movimientos."));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    axios
      .get(apiUrl("/api/store-accounting/categories"), { headers: authHeaders() })
      .then(({ data: body }) => setCategories(body.categories || []))
      .catch(() => {});
  }, []);

  const startEdit = (row) => {
    setEditingId(row._id);
    setForm({
      type: row.type,
      amount: String(row.amount),
      date: row.date ? row.date.slice(0, 10) : "",
      category: row.category || "",
      description: row.description || "",
      paymentMethod: row.paymentMethod || "",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = { ...form, amount: Number(form.amount), date: form.date || undefined };
      if (editingId) await axios.put(apiUrl(`/api/store-accounting/transactions/${editingId}`), payload, { headers: jsonHeaders() });
      else await axios.post(apiUrl("/api/store-accounting/transactions"), payload, { headers: jsonHeaders() });
      setMessage(editingId ? "Movimiento actualizado." : "Movimiento registrado.");
      setForm(null);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "No fue posible guardar el movimiento."));
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`¿Borrar "${row.description || row.category || "movimiento"}"?`)) return;
    try {
      await axios.delete(apiUrl(`/api/store-accounting/transactions/${row._id}`), { headers: authHeaders() });
      await load();
    } catch (err) {
      setError(errorMessage(err, "No fue posible borrar el movimiento."));
    }
  };

  // El CSV exige el token: se descarga como blob, no con un <a href>.
  const handleExport = async () => {
    try {
      const response = await axios.get(apiUrl("/api/store-accounting/export"), { headers: authHeaders(), params: { from: filters.from, to: filters.to }, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `contabilidad-${filters.from}-a-${filters.to}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError("No fue posible exportar los movimientos.");
    }
  };

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Movimientos</h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={handleExport}>
            Exportar CSV
          </button>
          <button
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setEditingId(null);
              setForm((f) => (f && !editingId ? null : { ...initialForm }));
            }}
          >
            {form && !editingId ? "Cancelar" : "Nuevo gasto o ingreso"}
          </button>
        </div>
      </div>
      <p>Las ventas, tarjetas de regalo, anticipos y abonos de mayoreo entran solos; aquí registras lo demás (renta, sueldos, servicios…). Las compras a proveedores se registran en Compras.</p>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      {form ? (
        <form onSubmit={handleSubmit} style={{ maxWidth: 1000, margin: "1rem 0 0" }}>
          <h4>{editingId ? "Editar movimiento" : "Nuevo movimiento"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <label>
              Tipo
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </label>
            <label>
              Monto (MXN)
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
            </label>
            <label>
              Fecha (hoy si se deja vacío)
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </label>
            <label>
              Categoría
              <input type="text" list="store-finance-categories" value={form.category} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Renta, sueldos, luz…" />
              <datalist id="store-finance-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              Forma de pago
              <select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                <option value="">—</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Descripción
              <input type="text" value={form.description} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button type="submit" style={{ width: "auto" }}>
              {editingId ? "Guardar cambios" : "Registrar"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "auto" }}
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem", alignItems: "flex-end" }}>
        <label style={{ marginBottom: 0 }}>
          Desde
          <input type="date" value={filters.from} onChange={setFilter("from")} />
        </label>
        <label style={{ marginBottom: 0 }}>
          Hasta
          <input type="date" value={filters.to} onChange={setFilter("to")} />
        </label>
        <label style={{ marginBottom: 0 }}>
          Tipo
          <select value={filters.type} onChange={setFilter("type")}>
            <option value="">Todos</option>
            <option value="income">Ingresos</option>
            <option value="expense">Gastos</option>
          </select>
        </label>
        <label style={{ marginBottom: 0 }}>
          Origen
          <select value={filters.automatic} onChange={setFilter("automatic")}>
            <option value="">Todos</option>
            <option value="true">Automáticos</option>
            <option value="false">Manuales y compras</option>
          </select>
        </label>
        {isLoading ? <span style={{ fontSize: "0.8rem", color: "var(--placeholder-color)" }}>Cargando...</span> : null}
      </div>

      {data ? (
        <p style={{ marginTop: "1rem" }}>
          Ingresos <strong>{formatMxn(data.totals.income)}</strong> · Gastos <strong>{formatMxn(data.totals.expense)}</strong> · Neto{" "}
          <strong style={{ color: data.totals.net < 0 ? "var(--error-color)" : undefined }}>{formatMxn(data.totals.net)}</strong>
        </p>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Categoría</th>
            <th>Descripción</th>
            <th>Monto</th>
            <th>Forma de pago</th>
            <th>Origen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data && data.rows.length === 0 ? (
            <tr>
              <td colSpan={8}>Sin movimientos en el periodo.</td>
            </tr>
          ) : null}
          {(data?.rows || []).map((row) => {
            const link = sourceLink(row);
            return (
              <tr key={row._id}>
                <td>{formatDate(row.date)}</td>
                <td>
                  <span className={`badge badge-${row.type === "income" ? "green" : "red"}`}>{row.type === "income" ? "Ingreso" : "Gasto"}</span>
                </td>
                <td>{row.category || "—"}</td>
                <td>{link ? <Link to={link}>{row.description || "Ver"}</Link> : row.description || "—"}</td>
                <td>{formatMxn(row.amount)}</td>
                <td>{PAYMENT_METHOD_LABELS[row.paymentMethod] || "—"}</td>
                <td>{row.automatic ? "Automático" : row.source === "purchase" ? "Compra" : row.source === "opening_balance" ? "Saldo inicial" : "Manual"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {row.source === "manual" ? (
                    <>
                      <button type="button" style={{ width: "auto" }} onClick={() => startEdit(row)}>
                        Editar
                      </button>{" "}
                      <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => handleDelete(row)}>
                        Borrar
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

export default StoreFinanceLedger;
