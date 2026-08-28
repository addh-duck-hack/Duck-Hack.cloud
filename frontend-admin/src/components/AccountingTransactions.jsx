import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";

const initialForm = { type: "expense", amount: "", date: "", category: "", description: "", client: "" };

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const formatDate = (value) => formatCalendarDate(value) || "—";

const SOURCE_LABELS = {
  manual: "Manual",
  hosting_payment: "Pago de hosting",
  design_debt: "Deuda",
  opening_balance: "Saldo inicial",
};

const AccountingTransactions = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [filters, setFilters] = useState({ type: "", startDate: "", endDate: "" });
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = {};
      if (filters.type) params.type = filters.type;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const response = await axios.get(`${baseUrl}/api/accounting/transactions`, {
        headers: getAuthHeaders(),
        params,
      });
      setTransactions(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar las transacciones.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadClients = useCallback(async () => {
    try {
      const response = await axios.get(`${baseUrl}/api/agency-clients`, { headers: getAuthHeaders() });
      setClients(response.data?.items || []);
    } catch {
      // Sin bloquear la pantalla si esto falla — el select de cliente solo queda vacío.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const startEdit = (transaction) => {
    setEditingId(transaction._id);
    setForm({
      type: transaction.type,
      amount: String(transaction.amount),
      date: transaction.date ? transaction.date.slice(0, 10) : "",
      category: transaction.category || "",
      description: transaction.description || "",
      client: transaction.client?._id || transaction.client || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = {
        type: form.type,
        amount: Number(form.amount),
        date: form.date || undefined,
        category: form.category,
        description: form.description,
        client: form.client || null,
      };

      if (editingId) {
        await axios.put(`${baseUrl}/api/accounting/transactions/${editingId}`, payload, {
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        });
        setMessage("Transacción actualizada.");
      } else {
        await axios.post(`${baseUrl}/api/accounting/transactions`, payload, {
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        });
        setMessage("Transacción registrada.");
      }
      resetForm();
      setShowForm(false);
      await loadTransactions();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar la transacción.");
    }
  };

  const handleDelete = async (id) => {
    setError("");
    setMessage("");
    try {
      await axios.delete(`${baseUrl}/api/accounting/transactions/${id}`, { headers: getAuthHeaders() });
      await loadTransactions();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar la transacción.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Movimientos de contabilidad</h3>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="button" onClick={() => navigate("/admin/accounting")} className="btn-secondary" style={{ width: "auto" }}>
            Volver al dashboard
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm((v) => !v);
            }}
            style={{ width: "auto" }}
          >
            {showForm ? "Cancelar" : "Nuevo movimiento"}
          </button>
        </div>
      </div>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      {/* El formulario sí lleva un tope propio (a diferencia de la sección,
          que ya no lo tiene para que la tabla de abajo use todo el ancho)
          para que sus campos no queden absurdamente anchos. */}
      {showForm ? (
        <form onSubmit={handleSubmit} style={{ maxWidth: 1000, margin: "1rem 0 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label>
              Tipo
              <select name="type" value={form.type} onChange={handleFormChange}>
                <option value="income">Ingreso</option>
                <option value="expense">Egreso</option>
              </select>
            </label>
            <label>
              Monto (MXN)
              <input type="number" name="amount" min="0.01" step="0.01" value={form.amount} onChange={handleFormChange} required />
            </label>
            <label>
              Fecha (hoy si se deja vacío)
              <input type="date" name="date" value={form.date} onChange={handleFormChange} />
            </label>
            <label>
              Categoría
              <input type="text" name="category" value={form.category} onChange={handleFormChange} placeholder="Licencias, sueldos, hosting..." />
            </label>
            <label style={{ gridColumn: "1 / span 2" }}>
              Descripción
              <input type="text" name="description" value={form.description} onChange={handleFormChange} />
            </label>
            <label>
              Cliente (opcional)
              <select name="client" value={form.client} onChange={handleFormChange}>
                <option value="">— Sin cliente —</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.businessName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" style={{ width: "auto" }}>
              {editingId ? "Actualizar movimiento" : "Registrar movimiento"}
            </button>
          </div>
        </form>
      ) : null}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem", alignItems: "flex-end" }}>
        <label style={{ marginBottom: 0 }}>
          Tipo
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
            <option value="">Todos</option>
            <option value="income">Ingresos</option>
            <option value="expense">Egresos</option>
          </select>
        </label>
        <label style={{ marginBottom: 0 }}>
          Desde
          <input type="date" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} />
        </label>
        <label style={{ marginBottom: 0 }}>
          Hasta
          <input type="date" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} />
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Categoría</th>
            <th>Descripción</th>
            <th>Cliente</th>
            <th>Monto</th>
            <th>Origen</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && transactions.length === 0 ? (
            <tr>
              <td colSpan={8}>Sin movimientos registrados.</td>
            </tr>
          ) : null}
          {transactions.map((t) => (
            <tr key={t._id}>
              <td>{formatDate(t.date)}</td>
              <td>
                <span className={`badge badge-${t.type === "income" ? "green" : "red"}`}>
                  {t.type === "income" ? "Ingreso" : "Egreso"}
                </span>
              </td>
              <td>{t.category || "—"}</td>
              <td>{t.description || "—"}</td>
              <td>{t.client?.businessName || "—"}</td>
              <td>{formatMxn(t.amount)}</td>
              <td>{SOURCE_LABELS[t.source] || t.source}</td>
              <td style={{ display: "flex", gap: "0.5rem" }}>
                {t.source === "manual" ? (
                  <>
                    <button type="button" onClick={() => startEdit(t)}>
                      Editar
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => handleDelete(t._id)}>
                      Eliminar
                    </button>
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default AccountingTransactions;
