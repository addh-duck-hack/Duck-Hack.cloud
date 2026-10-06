import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { mediaSrc } from "../utils/mediaApi";
import Alert from "./Alert";

// Banners de promociones (módulo "promoBanner",
// packages/core-api/modules/promoBanners.js). Estado por fechas e interruptor;
// si el destino ya no sirve (cupón vencido/agotado, categoría borrada) el
// banner no sale en el sitio aunque esté activo: se marca aquí.

const STATUS = {
  active: { label: "Activo", color: "green" },
  scheduled: { label: "Programado", color: "blue" },
  expired: { label: "Vencido", color: "red" },
  off: { label: "Apagado", color: "red" },
};
const PLACEMENT_LABELS = { home: "Inicio", shop: "Tienda", all: "Inicio y tienda" };

export const targetLabel = (banner) => {
  const t = banner.targetSummary;
  const { type, value } = banner.target || {};
  if (type === "category") return `Categoría: ${t?.name || "—"}`;
  if (type === "coupon") return `Cupón ${value}${t?.label ? ` (${t.label})` : ""}`;
  if (type === "url") return `Enlace: ${value}`;
  return "Sin botón";
};

const PromoBannerList = () => {
  const navigate = useNavigate();
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${baseUrl}/api/promo-banners`, { headers: getAuthHeaders() });
      setBanners(data.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los banners.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (banner) => {
    setError("");
    try {
      await axios.put(
        `${baseUrl}/api/promo-banners/${banner._id}`,
        { isActive: !banner.isActive },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el cambio.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este banner?")) return;
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/promo-banners/${id}`, { headers: getAuthHeaders() });
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el banner.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Banners de promociones</h3>
        <button type="button" onClick={() => navigate("/admin/promo-banners/new")} style={{ width: "auto" }}>
          Nuevo banner
        </button>
      </div>
      <p>
        Campañas con imagen y botón en el inicio y/o la tienda del sitio. Se muestran solas dentro de sus fechas, en el orden de la
        lista. Un banner con un cupón que ya venció o se agotó deja de mostrarse.
      </p>

      {error ? <Alert type="error">{error}</Alert> : null}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Banner</th>
              <th>Botón</th>
              <th>Dónde</th>
              <th>Fechas</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && banners.length === 0 ? (
              <tr>
                <td colSpan={6}>Sin banners todavía.</td>
              </tr>
            ) : null}
            {banners.map((b) => {
              const status = STATUS[b.status] || STATUS.active;
              return (
                <tr key={b._id}>
                  <td style={{ minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      {b.image ? <img src={mediaSrc(b.image)} alt="" style={{ width: 72, height: 40, objectFit: "cover", borderRadius: 4 }} /> : null}
                      <div>
                        <strong>{b.title}</strong>
                        {b.text ? <small style={{ display: "block", opacity: 0.75 }}>{b.text}</small> : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    {b.buttonLabel ? <strong>{b.buttonLabel}</strong> : null}
                    <small style={{ display: "block", opacity: 0.75 }}>{targetLabel(b)}</small>
                  </td>
                  <td>{PLACEMENT_LABELS[b.placement] || b.placement}</td>
                  <td>
                    {b.startsAt || b.endsAt
                      ? `${b.startsAt ? formatCalendarDate(b.startsAt) : "Ya"} – ${b.endsAt ? formatCalendarDate(b.endsAt) : "sin fin"}`
                      : "Siempre"}
                  </td>
                  <td>
                    <span className={`badge badge-${status.color}`}>{status.label}</span>
                    {b.targetProblem && b.status !== "off" && b.status !== "expired" ? (
                      <small style={{ display: "block", marginTop: 4, color: "var(--danger-color, #c0392b)" }}>No se muestra: {b.targetProblem}</small>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => navigate(`/admin/promo-banners/${b._id}/edit`)} style={{ width: "auto" }}>
                        Editar
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => toggle(b)} style={{ width: "auto" }}>
                        {b.isActive ? "Apagar" : "Encender"}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => handleDelete(b._id)} style={{ width: "auto" }}>
                        Eliminar
                      </button>
                    </div>
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

export default PromoBannerList;
