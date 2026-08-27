import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const initialState = { client: "", concept: "", amount: "", issuedAt: "" };

const InvoiceForm = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const payload = {
        client: form.client,
        concept: form.concept,
        amount: Number(form.amount),
        issuedAt: form.issuedAt || undefined,
      };
      await axios.post(`${baseUrl}/api/invoices`, payload, {
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      navigate("/admin/invoices");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible crear la factura.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 900 }}>
      <h3>Nueva factura</h3>
      <p>Comprobante de pago en PDF sin validez fiscal. El folio se asigna automáticamente.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: 500, margin: 0 }}>
        <label>
          Cliente
          <select name="client" value={form.client} onChange={handleChange} required>
            <option value="">Selecciona un cliente</option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.businessName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Concepto
          <input type="text" name="concept" value={form.concept} onChange={handleChange} placeholder="Pago de hosting - Septiembre 2026" required />
        </label>

        <label>
          Monto (MXN)
          <input type="number" name="amount" min="0.01" step="0.01" value={form.amount} onChange={handleChange} required />
        </label>

        <label>
          Fecha (hoy si se deja vacío)
          <input type="date" name="issuedAt" value={form.issuedAt} onChange={handleChange} />
        </label>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
            {isLoading ? "Guardando..." : "Crear factura"}
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
