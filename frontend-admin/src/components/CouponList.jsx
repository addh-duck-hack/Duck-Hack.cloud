import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";

// Cupones de descuento (módulo "coupons" de los permisos). Los usos los
// cuenta el backend (packages/core-api/lib/coupons.js): un pedido cancelado
// no cuenta. Un cupón ya usado no se borra, se desactiva.

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export const couponValueLabel = (coupon) => {
  if (coupon.type === "percent") return `${coupon.value}%`;
  if (coupon.type === "free_shipping") return "Envío gratis";
  return formatMxn(coupon.value);
};

// Vigente / programado / vencido / inactivo / agotado, con el color del badge.
const couponStatus = (coupon, now = new Date()) => {
  if (coupon.isActive === false) return { label: "Inactivo", color: "red" };
  if (coupon.endsAt && now > new Date(coupon.endsAt)) return { label: "Vencido", color: "red" };
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return { label: "Agotado", color: "yellow" };
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return { label: "Programado", color: "blue" };
  return { label: "Vigente", color: "green" };
};

const CouponList = () => {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // Los generados por el carrito abandonado pueden ser muchos: ocultos por default.
  const [showAutomatic, setShowAutomatic] = useState(false);
  const automaticCount = coupons.filter((c) => c.source === "abandoned_cart").length;
  const visible = showAutomatic ? coupons : coupons.filter((c) => c.source !== "abandoned_cart");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadCoupons = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/coupons`, { headers: getAuthHeaders() });
      setCoupons(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los cupones.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este cupón?")) return;
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/coupons/${id}`, { headers: getAuthHeaders() });
      await loadCoupons();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el cupón.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Cupones</h3>
        <button type="button" onClick={() => navigate("/admin/coupons/new")} style={{ width: "auto" }}>
          Nuevo cupón
        </button>
      </div>
      <p>Códigos de descuento que el cliente escribe en la canasta. Un cupón que ya se usó no se puede borrar: desactívalo.</p>

      {automaticCount ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input type="checkbox" checked={showAutomatic} onChange={(e) => setShowAutomatic(e.target.checked)} style={{ width: "auto" }} />
          Mostrar los {automaticCount} cupones automáticos (carrito abandonado)
        </label>
      ) : null}

      {error ? <div className="auth-error">{error}</div> : null}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descuento</th>
              <th>Compra mínima</th>
              <th>Vigencia</th>
              <th>Usos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && visible.length === 0 ? (
              <tr>
                <td colSpan={7}>Sin cupones registrados.</td>
              </tr>
            ) : null}
            {visible.map((c) => {
              const status = couponStatus(c);
              return (
                <tr key={c._id}>
                  <td>
                    <strong>{c.code}</strong>
                    {c.source === "abandoned_cart" ? (
                      <span className="badge badge-blue" style={{ marginLeft: "0.4rem" }}>
                        Automático
                      </span>
                    ) : null}
                    {c.customerEmail ? <small style={{ display: "block", opacity: 0.75 }}>Solo para {c.customerEmail}</small> : null}
                    {c.description && !c.customerEmail ? <small style={{ display: "block", opacity: 0.75 }}>{c.description}</small> : null}
                  </td>
                  <td>{couponValueLabel(c)}</td>
                  <td>{c.minPurchase ? formatMxn(c.minPurchase) : "—"}</td>
                  <td>
                    {c.startsAt || c.endsAt
                      ? `${c.startsAt ? formatCalendarDate(c.startsAt) : "Ya"} – ${c.endsAt ? formatCalendarDate(c.endsAt) : "sin fin"}`
                      : "Sin límite"}
                  </td>
                  <td>
                    {c.usedCount || 0}
                    {c.maxUses ? ` / ${c.maxUses}` : ""}
                    {c.maxUsesPerCustomer ? <small style={{ display: "block", opacity: 0.75 }}>{c.maxUsesPerCustomer} por cliente</small> : null}
                  </td>
                  <td>
                    <span className={`badge badge-${status.color}`}>{status.label}</span>
                  </td>
                  <td style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" onClick={() => navigate(`/admin/coupons/${c._id}/edit`)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleDelete(c._id)}
                      disabled={c.usedCount > 0}
                      title={c.usedCount > 0 ? "Ya se usó: desactívalo en lugar de borrarlo" : undefined}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default CouponList;
