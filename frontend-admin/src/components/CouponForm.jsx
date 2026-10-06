import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import Alert from "./Alert";

// Alta y edición de un cupón (packages/core-api/modules/coupons.js). Las
// fechas se capturan como día de calendario: inicio a las 00:00 y fin a las
// 23:59 (hora local), para que "vence el 15" incluya todo el 15.

const TYPES = [
  { value: "amount", label: "Monto fijo ($)" },
  { value: "percent", label: "Porcentaje (%)" },
  { value: "free_shipping", label: "Envío gratis" },
];

const initialState = {
  code: "",
  description: "",
  type: "amount",
  value: "",
  minPurchase: "",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  maxUsesPerCustomer: "1",
  isActive: true,
};

// Date (ISO) → "AAAA-MM-DD" local, para <input type="date">.
const toDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromDateInput = (value, endOfDay) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return (endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d, 0, 0, 0)).toISOString();
};
const numberOrNull = (value) => (value === "" || value === null ? null : Number(value));

const CouponForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialState);
  const [usedCount, setUsedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    if (!isEditing) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const { data: c } = await axios.get(`${baseUrl}/api/coupons/${id}`, { headers: getAuthHeaders() });
        setForm({
          code: c.code || "",
          description: c.description || "",
          type: c.type || "amount",
          value: c.value ? String(c.value) : "",
          minPurchase: c.minPurchase ? String(c.minPurchase) : "",
          startsAt: toDateInput(c.startsAt),
          endsAt: toDateInput(c.endsAt),
          maxUses: c.maxUses ? String(c.maxUses) : "",
          maxUsesPerCustomer: c.maxUsesPerCustomer ? String(c.maxUsesPerCustomer) : "",
          isActive: c.isActive !== false,
        });
        setUsedCount(c.usedCount || 0);
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar el cupón.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : name === "code" ? value.toUpperCase().replace(/\s/g, "") : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        code: form.code,
        description: form.description,
        type: form.type,
        value: form.type === "free_shipping" ? 0 : numberOrNull(form.value),
        minPurchase: numberOrNull(form.minPurchase),
        startsAt: fromDateInput(form.startsAt, false),
        endsAt: fromDateInput(form.endsAt, true),
        maxUses: numberOrNull(form.maxUses),
        maxUsesPerCustomer: numberOrNull(form.maxUsesPerCustomer),
        isActive: form.isActive,
      };
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      if (isEditing) await axios.put(`${baseUrl}/api/coupons/${id}`, payload, { headers });
      else await axios.post(`${baseUrl}/api/coupons`, payload, { headers });
      navigate("/admin/coupons");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el cupón.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>Cargando...</p>;

  return (
    <section style={{ maxWidth: 1300 }}>
      <h3>{isEditing ? `Editar cupón ${form.code}` : "Nuevo cupón"}</h3>
      {isEditing && usedCount > 0 ? <p>Este cupón se ha usado en {usedCount} pedido(s).</p> : null}

      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.75rem" }}>
          <label>
            Código
            <input type="text" name="code" value={form.code} onChange={handleChange} maxLength={30} required placeholder="BIENVENIDA10" />
            <small>Lo que el cliente escribe. Letras, números, - y _.</small>
          </label>
          <label>
            Nota interna (opcional)
            <input type="text" name="description" value={form.description} onChange={handleChange} maxLength={200} placeholder="Campaña de octubre en Instagram" />
          </label>
        </div>

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
          <label>
            Tipo de descuento
            <select name="type" value={form.type} onChange={handleChange}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {form.type !== "free_shipping" ? (
            <label>
              {form.type === "percent" ? "Porcentaje" : "Monto (MXN)"}
              <input
                type="number"
                name="value"
                min={form.type === "percent" ? 1 : 0.01}
                max={form.type === "percent" ? 100 : undefined}
                step={form.type === "percent" ? 1 : 0.01}
                value={form.value}
                onChange={handleChange}
                required
              />
            </label>
          ) : (
            <p style={{ alignSelf: "center", margin: 0 }}>El envío sale en $0 (no aplica a pedidos para recoger).</p>
          )}
          <label>
            Compra mínima (opcional)
            <input type="number" name="minPurchase" min="0" step="0.01" value={form.minPurchase} onChange={handleChange} />
          </label>
        </div>

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem" }}>
          <label>
            Válido desde (opcional)
            <input type="date" name="startsAt" value={form.startsAt} onChange={handleChange} />
          </label>
          <label>
            Válido hasta (opcional)
            <input type="date" name="endsAt" value={form.endsAt} onChange={handleChange} />
          </label>
          <label>
            Usos en total (opcional)
            <input type="number" name="maxUses" min="1" step="1" value={form.maxUses} onChange={handleChange} placeholder="Sin límite" />
          </label>
          <label>
            Usos por cliente (opcional)
            <input type="number" name="maxUsesPerCustomer" min="1" step="1" value={form.maxUsesPerCustomer} onChange={handleChange} placeholder="Sin límite" />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto" }} />
          Cupón activo
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/coupons")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default CouponForm;
