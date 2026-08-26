import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const initialPaymentForm = { paidAt: "", coversUntil: "", amount: "", notes: "" };
const initialDebtForm = { description: "", amount: "", notes: "" };

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "—");

const AgencyClientDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [client, setClient] = useState(null);
  const [payments, setPayments] = useState([]);
  const [debts, setDebts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [debtForm, setDebtForm] = useState(initialDebtForm);

  const baseUrl = getApiBaseUrl();

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  const loadAll = async () => {
    setIsLoading(true);
    setError("");
    try {
      const [clientRes, paymentsRes, debtsRes] = await Promise.all([
        axios.get(`${baseUrl}/api/agency-clients/${id}`, { headers: getAuthHeaders() }),
        axios.get(`${baseUrl}/api/agency-clients/${id}/hosting-payments`, { headers: getAuthHeaders() }),
        axios.get(`${baseUrl}/api/agency-clients/${id}/design-debts`, { headers: getAuthHeaders() }),
      ]);
      setClient(clientRes.data);
      setPayments(paymentsRes.data?.items || []);
      setDebts(debtsRes.data?.items || []);
    } catch (err) {
      const msg = err.response?.data?.error?.message || "No fue posible cargar la ficha del cliente.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAddPayment = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await axios.post(
        `${baseUrl}/api/agency-clients/${id}/hosting-payments`,
        {
          paidAt: paymentForm.paidAt,
          coversUntil: paymentForm.coversUntil,
          amount: paymentForm.amount ? Number(paymentForm.amount) : undefined,
          notes: paymentForm.notes,
        },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setPaymentForm(initialPaymentForm);
      setMessage("Pago de hosting registrado.");
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible registrar el pago.");
    }
  };

  const handleDeletePayment = async (paymentId) => {
    setError("");
    setMessage("");
    try {
      await axios.delete(`${baseUrl}/api/agency-clients/${id}/hosting-payments/${paymentId}`, {
        headers: getAuthHeaders(),
      });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el pago.");
    }
  };

  const handleAddDebt = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await axios.post(
        `${baseUrl}/api/agency-clients/${id}/design-debts`,
        {
          description: debtForm.description,
          amount: Number(debtForm.amount),
          notes: debtForm.notes,
        },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setDebtForm(initialDebtForm);
      setMessage("Deuda de diseño registrada.");
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible registrar la deuda.");
    }
  };

  const handleMarkDebtPaid = async (debt) => {
    setError("");
    setMessage("");
    try {
      await axios.put(
        `${baseUrl}/api/agency-clients/${id}/design-debts/${debt._id}`,
        { amountPaid: debt.amount },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible actualizar la deuda.");
    }
  };

  const handleDeleteDebt = async (debtId) => {
    setError("");
    setMessage("");
    try {
      await axios.delete(`${baseUrl}/api/agency-clients/${id}/design-debts/${debtId}`, {
        headers: getAuthHeaders(),
      });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar la deuda.");
    }
  };

  if (isLoading && !client) {
    return <p>Cargando...</p>;
  }

  return (
    <section style={{ marginTop: "2rem", textAlign: "left", maxWidth: 1000, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem" }}>
        <button type="button" onClick={() => navigate("/admin/agency-clients")}>
          Volver al listado
        </button>
        {client ? (
          <button type="button" onClick={() => navigate(`/admin/agency-clients/${id}/edit`)}>
            Editar datos
          </button>
        ) : null}
      </div>

      {message ? <p style={{ color: "#256029" }}>{message}</p> : null}
      {error ? <p style={{ color: "#9d1c1c" }}>{error}</p> : null}

      {client ? (
        <>
          <h3>{client.businessName}</h3>
          <p>
            {client.contactName || "—"} · {client.contactEmail || "—"} · {client.contactPhone || "—"}
          </p>
          <p>
            Sitio: {client.siteUrl || "—"} · Hosting: {client.hostingProvider || "—"} ({client.serverLocation || "—"})
          </p>
          {client.notes ? <p>Notas: {client.notes}</p> : null}

          <h4>Historial de pagos de hosting</h4>
          <table>
            <thead>
              <tr>
                <th>Pagado el</th>
                <th>Cubre hasta</th>
                <th>Monto</th>
                <th>Notas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={5}>Sin pagos registrados.</td>
                </tr>
              ) : null}
              {payments.map((payment) => (
                <tr key={payment._id}>
                  <td>{formatDate(payment.paidAt)}</td>
                  <td>{formatDate(payment.coversUntil)}</td>
                  <td>{payment.amount ? formatCurrency(payment.amount) : "—"}</td>
                  <td>{payment.notes || "—"}</td>
                  <td>
                    <button type="button" className="btn-secondary" onClick={() => handleDeletePayment(payment._id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form onSubmit={handleAddPayment} style={{ maxWidth: 500 }}>
            <label>
              Fecha de pago
              <input
                type="date"
                required
                value={paymentForm.paidAt}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, paidAt: e.target.value }))}
              />
            </label>
            <label>
              Cubre hasta
              <input
                type="date"
                required
                value={paymentForm.coversUntil}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, coversUntil: e.target.value }))}
              />
            </label>
            <label>
              Monto (opcional)
              <input
                type="number"
                min="0"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </label>
            <label>
              Notas
              <input
                type="text"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </label>
            <button type="submit">Registrar pago</button>
          </form>

          <h4>Deudas de diseño</h4>
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Monto</th>
                <th>Pagado</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {debts.length === 0 ? (
                <tr>
                  <td colSpan={5}>Sin deudas registradas.</td>
                </tr>
              ) : null}
              {debts.map((debt) => (
                <tr key={debt._id}>
                  <td>{debt.description}</td>
                  <td>{formatCurrency(debt.amount)}</td>
                  <td>{formatCurrency(debt.amountPaid)}</td>
                  <td>
                    <span className={`badge badge-${debt.status === "paid" ? "green" : debt.status === "partial" ? "yellow" : "red"}`}>
                      {debt.status}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: "0.5rem" }}>
                    {debt.status !== "paid" ? (
                      <button type="button" onClick={() => handleMarkDebtPaid(debt)}>
                        Marcar pagada
                      </button>
                    ) : null}
                    <button type="button" className="btn-secondary" onClick={() => handleDeleteDebt(debt._id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form onSubmit={handleAddDebt} style={{ maxWidth: 500 }}>
            <label>
              Descripción
              <input
                type="text"
                required
                value={debtForm.description}
                onChange={(e) => setDebtForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <label>
              Monto
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={debtForm.amount}
                onChange={(e) => setDebtForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </label>
            <label>
              Notas
              <input
                type="text"
                value={debtForm.notes}
                onChange={(e) => setDebtForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </label>
            <button type="submit">Registrar deuda</button>
          </form>
        </>
      ) : null}
    </section>
  );
};

export default AgencyClientDetail;
