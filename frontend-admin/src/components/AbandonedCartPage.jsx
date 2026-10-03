import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatDateTime } from "../utils/schedule";

// Carrito abandonado (módulo "abandonedCart", packages/core-api/modules/
// cart.js): ajustes del correo y cifras de los últimos 30 días. El correo lo
// manda una tarea programada a clientes con cuenta que dejan productos sin
// comprar; lleva un cupón opcional de un solo uso que solo ese cliente puede
// usar.

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const Stat = ({ label, value, hint }) => (
  <div style={{ flex: "1 1 180px", padding: "1rem", border: "1px solid var(--input-border-color)", borderRadius: 10, background: "var(--form-background-color)" }}>
    <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>{label}</div>
    <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{value}</div>
    {hint ? <small style={{ opacity: 0.7 }}>{hint}</small> : null}
  </div>
);

const AbandonedCartPage = () => {
  const [form, setForm] = useState(null);
  const [stats, setStats] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const baseUrl = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const load = async () => {
    try {
      const [settingsRes, statsRes] = await Promise.all([
        axios.get(`${baseUrl}/api/cart/abandoned/settings`, { headers }),
        axios.get(`${baseUrl}/api/cart/abandoned/stats`, { headers }),
      ]);
      const s = settingsRes.data;
      setForm({
        enabled: s.enabled,
        delayHours: String(s.delayHours),
        couponEnabled: s.coupon.enabled,
        couponType: s.coupon.type,
        couponValue: String(s.coupon.value ?? ""),
        couponMinPurchase: s.coupon.minPurchase == null ? "" : String(s.coupon.minPurchase),
        couponValidDays: String(s.coupon.validDays),
      });
      setStats(statsRes.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar la información.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setMessage("");
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await axios.put(
        `${baseUrl}/api/cart/abandoned/settings`,
        {
          enabled: form.enabled,
          delayHours: Number(form.delayHours),
          coupon: {
            enabled: form.couponEnabled,
            type: form.couponType,
            value: form.couponType === "free_shipping" ? 0 : Number(form.couponValue),
            minPurchase: form.couponMinPurchase === "" ? null : Number(form.couponMinPurchase),
            validDays: Number(form.couponValidDays),
          },
        },
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
      setMessage(data.message || "Ajustes guardados.");
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar los ajustes.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!form) return error ? <div className="auth-error">{error}</div> : <p>Cargando...</p>;

  return (
    <section style={{ maxWidth: 1100 }}>
      <h3 style={{ marginTop: 0 }}>Carrito abandonado</h3>
      <p>
        Cuando un cliente con cuenta deja productos en su carrito sin comprar, le mandamos un correo con su carrito a precios actuales y,
        si lo activas, un cupón de un solo uso que solo él puede usar. Un correo por cada vez que lo abandona.
      </p>

      {stats ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0" }}>
            <Stat label="Correos enviados (30 días)" value={stats.last30Days.sent} />
            <Stat label="Compras recuperadas (30 días)" value={stats.last30Days.recovered} hint="Compraron dentro de 7 días del correo" />
            <Stat label="Monto recuperado (30 días)" value={formatMxn(stats.last30Days.recoveredTotal)} />
            <Stat label="Carritos esperando correo" value={stats.waiting} hint="Se mandan en la siguiente revisión (cada 15 min)" />
          </div>
        </>
      ) : null}

      {error ? <div className="auth-error">{error}</div> : null}
      {message ? <div className="auth-success">{message}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" name="enabled" checked={form.enabled} onChange={handleChange} style={{ width: "auto" }} />
          Mandar el correo de carrito abandonado
        </label>
        <label style={{ maxWidth: 320 }}>
          Después de cuántas horas sin comprar
          <input type="number" name="delayHours" min="1" max="72" step="1" value={form.delayHours} onChange={handleChange} required disabled={!form.enabled} />
          <small>Carritos de más de 7 días ya no se recuerdan.</small>
        </label>

        <fieldset style={{ marginTop: "0.75rem" }} disabled={!form.enabled}>
          <legend>Cupón</legend>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="couponEnabled" checked={form.couponEnabled} onChange={handleChange} style={{ width: "auto" }} />
            Incluir un cupón para terminar la compra
          </label>
          {form.couponEnabled ? (
            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem" }}>
              <label>
                Tipo
                <select name="couponType" value={form.couponType} onChange={handleChange}>
                  <option value="percent">Porcentaje (%)</option>
                  <option value="amount">Monto fijo ($)</option>
                  <option value="free_shipping">Envío gratis</option>
                </select>
              </label>
              {form.couponType !== "free_shipping" ? (
                <label>
                  {form.couponType === "percent" ? "Porcentaje" : "Monto (MXN)"}
                  <input
                    type="number"
                    name="couponValue"
                    min={form.couponType === "percent" ? 1 : 0.01}
                    max={form.couponType === "percent" ? 100 : undefined}
                    step={form.couponType === "percent" ? 1 : 0.01}
                    value={form.couponValue}
                    onChange={handleChange}
                    required
                  />
                </label>
              ) : (
                <span />
              )}
              <label>
                Compra mínima (opcional)
                <input type="number" name="couponMinPurchase" min="0" step="0.01" value={form.couponMinPurchase} onChange={handleChange} />
              </label>
              <label>
                Vigencia (días)
                <input type="number" name="couponValidDays" min="1" max="60" step="1" value={form.couponValidDays} onChange={handleChange} required />
              </label>
            </div>
          ) : null}
          <small>Los cupones generados aparecen en Cupones con la etiqueta "Automático".</small>
        </fieldset>

        <button type="submit" disabled={isSaving} style={{ width: "auto", marginTop: "1rem" }}>
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
      </form>

      {stats?.recent?.length ? (
        <>
          <h4 style={{ marginTop: "2rem" }}>Correos recientes</h4>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Enviado</th>
                  <th>Productos</th>
                  <th>Cupón</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((r) => (
                  <tr key={r._id}>
                    <td>
                      {r.customer?.name || "—"}
                      {r.customer?.email ? <small style={{ display: "block", opacity: 0.75 }}>{r.customer.email}</small> : null}
                    </td>
                    <td>{formatDateTime(r.remindedAt)}</td>
                    <td>{r.items}</td>
                    <td>{r.coupon || "—"}</td>
                    <td>
                      {r.recoveredAt ? (
                        <span className="badge badge-green">Compró {formatMxn(r.recoveredTotal)}</span>
                      ) : (
                        <span className="badge badge-yellow">Sin compra</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
};

export default AbandonedCartPage;
