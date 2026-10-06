import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl, authHeaders, jsonHeaders, errorMessage } from "../utils/storeFinance";
import PhoneInput from "./PhoneInput";
import Alert from "./Alert";

const initialForm = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  billingName: "",
  billingRfc: "",
  creditDays: "0",
  creditLimit: "",
  discountPct: "0",
  notes: "",
  isActive: true,
};

const WholesaleCustomerForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    axios
      .get(apiUrl(`/api/wholesale/customers/${id}`), { headers: authHeaders() })
      .then(({ data }) =>
        setForm({
          ...initialForm,
          ...Object.fromEntries(Object.keys(initialForm).map((key) => [key, data[key] ?? initialForm[key]])),
          creditDays: String(data.creditDays ?? 0),
          creditLimit: data.creditLimit === null || data.creditLimit === undefined ? "" : String(data.creditLimit),
          discountPct: String(data.discountPct ?? 0),
        })
      )
      .catch((err) => setError(errorMessage(err, "No fue posible cargar el cliente.")));
  }, [id]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = { ...form, creditLimit: form.creditLimit === "" ? null : form.creditLimit };
      const response = id
        ? await axios.put(apiUrl(`/api/wholesale/customers/${id}`), payload, { headers: jsonHeaders() })
        : await axios.post(apiUrl("/api/wholesale/customers"), payload, { headers: jsonHeaders() });
      navigate(`/admin/wholesale/customers/${response.data.customer._id}`);
    } catch (err) {
      setError(errorMessage(err, "No fue posible guardar el cliente."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section style={{ maxWidth: 1000 }}>
      <h3>{id ? "Editar cliente mayorista" : "Nuevo cliente mayorista"}</h3>
      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
          <label>
            Nombre del negocio
            <input type="text" name="businessName" value={form.businessName} onChange={handleChange} maxLength={120} required />
          </label>
          <label>
            Persona de contacto
            <input type="text" name="contactName" value={form.contactName} onChange={handleChange} maxLength={120} />
          </label>
          <label>
            Correo
            <input type="email" name="email" value={form.email} onChange={handleChange} />
          </label>
          <label>
            Teléfono
            <PhoneInput name="phone" value={form.phone} onChange={handleChange} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Dirección de entrega
            <input type="text" name="address" value={form.address} onChange={handleChange} maxLength={300} />
          </label>
        </div>

        <h4 style={{ marginTop: "1.5rem" }}>Condiciones</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
          <label>
            Días de crédito (0 = contado)
            <input type="number" name="creditDays" min="0" max="365" step="1" value={form.creditDays} onChange={handleChange} />
          </label>
          <label>
            Límite de crédito (vacío = sin límite)
            <input type="number" name="creditLimit" min="0" step="0.01" value={form.creditLimit} onChange={handleChange} />
          </label>
          <label>
            Descuento sobre precio de catálogo (%)
            <input type="number" name="discountPct" min="0" max="90" step="0.01" value={form.discountPct} onChange={handleChange} />
          </label>
        </div>

        <h4 style={{ marginTop: "1.5rem" }}>Facturación (opcional)</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
          <label>
            Razón social
            <input type="text" name="billingName" value={form.billingName} onChange={handleChange} maxLength={160} />
          </label>
          <label>
            RFC
            <input type="text" name="billingRfc" value={form.billingRfc} onChange={handleChange} maxLength={13} style={{ textTransform: "uppercase" }} />
          </label>
        </div>

        <label>
          Notas
          <textarea name="notes" value={form.notes} onChange={handleChange} maxLength={1000} rows={3} />
        </label>
        {id ? (
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto" }} />
            Activo (los desactivados no aparecen al registrar ventas)
          </label>
        ) : null}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => navigate(id ? `/admin/wholesale/customers/${id}` : "/admin/wholesale/customers")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default WholesaleCustomerForm;
