import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatDateTime } from "../utils/schedule";
import Alert from "./Alert";

// Lista de deseos (módulo "wishlist", packages/core-api/modules/wishlist.js):
// interruptor del aviso "volvió a estar disponible", avisos de los últimos 30
// días y los productos más guardados en favoritos. El aviso lo manda una tarea
// programada (cada 15 min) a quienes tienen el producto en favoritos cuando
// pasa de agotado a disponible.

const Stat = ({ label, value, hint }) => (
  <div style={{ flex: "1 1 180px", padding: "1rem", border: "1px solid var(--input-border-color)", borderRadius: 10, background: "var(--form-background-color)" }}>
    <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>{label}</div>
    <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{value}</div>
    {hint ? <small style={{ opacity: 0.7 }}>{hint}</small> : null}
  </div>
);

const WishlistPage = () => {
  const [enabled, setEnabled] = useState(null);
  const [stats, setStats] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const baseUrl = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, statsRes] = await Promise.all([
          axios.get(`${baseUrl}/api/wishlist/settings`, { headers }),
          axios.get(`${baseUrl}/api/wishlist/stats`, { headers }),
        ]);
        setEnabled(settingsRes.data.enabled);
        setStats(statsRes.data);
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar la información.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (event) => {
    const next = event.target.checked;
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await axios.put(`${baseUrl}/api/wishlist/settings`, { enabled: next }, { headers: { ...headers, "Content-Type": "application/json" } });
      setEnabled(data.settings.enabled);
      setMessage(data.message || "Ajustes guardados.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar.");
    } finally {
      setIsSaving(false);
    }
  };

  if (enabled === null) return error ? <Alert type="error">{error}</Alert> : <p>Cargando...</p>;

  return (
    <section style={{ maxWidth: 1100 }}>
      <h3 style={{ marginTop: 0 }}>Lista de deseos</h3>
      <p>
        Cuando un producto agotado vuelve a tener existencias, le avisamos por correo a quienes lo guardaron en favoritos. Un aviso por
        cliente cada vez que se reabastece; pueden darse de baja desde el propio correo.
      </p>

      {error ? <Alert type="error">{error}</Alert> : null}
      {message ? <Alert type="success">{message}</Alert> : null}

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input type="checkbox" checked={enabled} onChange={toggle} disabled={isSaving} style={{ width: "auto" }} />
        Avisar cuando un favorito vuelva a estar disponible
      </label>

      {stats ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0" }}>
            <Stat label="Avisos enviados (30 días)" value={stats.last30Days.sent} hint={`A ${stats.last30Days.customers} cliente(s)`} />
            <Stat label="Clientes con favoritos" value={stats.favorites.customers} />
            <Stat label="Productos guardados" value={stats.favorites.total} hint="Suma de los favoritos de todos" />
          </div>

          <h4 style={{ marginTop: "1.5rem" }}>Más guardados en favoritos</h4>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Favoritos</th>
                  <th>Existencias</th>
                  <th>En la tienda</th>
                </tr>
              </thead>
              <tbody>
                {stats.topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Nadie ha guardado productos todavía.</td>
                  </tr>
                ) : (
                  stats.topProducts.map((t) => (
                    <tr key={t.product._id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {t.product.image ? (
                            <img src={`${baseUrl}/${t.product.image}`} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                          ) : null}
                          <span>{t.product.name}</span>
                        </div>
                      </td>
                      <td>{t.favorites}</td>
                      <td>{t.stock}</td>
                      <td>
                        {t.available ? (
                          <span className="badge badge-green">Disponible</span>
                        ) : (
                          <span className="badge badge-yellow">{t.product.isActive ? "Agotado" : "Inactivo"}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <small>Los agotados con muchos favoritos son buenos candidatos para reabastecer: al hacerlo, el aviso sale solo.</small>

          {stats.recent.length ? (
            <>
              <h4 style={{ marginTop: "2rem" }}>Avisos recientes</h4>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Producto</th>
                      <th>Enviado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((n) => (
                      <tr key={n._id}>
                        <td>
                          {n.customer?.name || "—"}
                          {n.customer?.email ? <small style={{ display: "block", opacity: 0.75 }}>{n.customer.email}</small> : null}
                        </td>
                        <td>{n.product?.name || "Producto eliminado"}</td>
                        <td>{formatDateTime(n.sentAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
};

export default WishlistPage;
