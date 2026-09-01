import React, { useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const initialForm = { paidAt: "", coversUntil: "", amount: "", notes: "" };

const AgencyClientHostingPaymentForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await axios.post(
        `${baseUrl}/api/agency-clients/${id}/hosting-payments`,
        {
          paidAt: form.paidAt,
          coversUntil: form.coversUntil,
          amount: form.amount ? Number(form.amount) : undefined,
          notes: form.notes,
        },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      navigate(`/admin/agency-clients/${id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible registrar el pago.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 500 }}>
      <div style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn-secondary" onClick={() => navigate(`/admin/agency-clients/${id}`)} style={{ width: "auto" }}>
          Volver a la ficha
        </button>
      </div>

      <h3>Registrar pago de hosting</h3>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <label>
          Fecha de pago
          <input
            type="date"
            required
            value={form.paidAt}
            onChange={(e) => setForm((prev) => ({ ...prev, paidAt: e.target.value }))}
          />
        </label>
        <label>
          Cubre hasta
          <input
            type="date"
            required
            value={form.coversUntil}
            onChange={(e) => setForm((prev) => ({ ...prev, coversUntil: e.target.value }))}
          />
        </label>
        <label>
          Monto (opcional)
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
          />
        </label>
        <label>
          Notas
          <input type="text" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
        </label>
        <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
          {isLoading ? "Guardando..." : "Registrar pago"}
        </button>
      </form>
    </section>
  );
};

export default AgencyClientHostingPaymentForm;
