import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { apiUrl, authHeaders, errorMessage, MOVEMENT_REASON_LABELS } from "../utils/storeFinance";
import Alert from "./Alert";

const formatDateTime = (value) => (value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—");

// Liga del documento que movió el stock.
const refLink = (m) => {
  if (m.refKind === "Order") return `/admin/orders/${m.refId}`;
  if (m.refKind === "WholesaleSale") return `/admin/wholesale/sales/${m.refId}`;
  if (m.refKind === "Purchase") return `/admin/finance/purchases/${m.refId}`;
  return null;
};

// Historial de movimientos de inventario (GET /api/inventory/movements).
// Página propia (/admin/inventory/movements, filtros por ?product=&variant=)
// o embebido en InventoryForm con `product`/`variant`.
const InventoryMovements = ({ product: productProp, variant: variantProp, embedded = false }) => {
  const [searchParams] = useSearchParams();
  const product = productProp || searchParams.get("product") || "";
  const variant = variantProp || searchParams.get("variant") || "";
  const [reason, setReason] = useState("");
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = useCallback(
    async (before) => {
      const params = { product: product || undefined, variant: variant || undefined, reason: reason || undefined, before, limit: 50 };
      const response = await axios.get(apiUrl("/api/inventory/movements"), { headers: authHeaders(), params });
      return response.data;
    },
    [product, variant, reason]
  );

  useEffect(() => {
    setError("");
    fetchPage()
      .then((data) => {
        setItems(data.items || []);
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => setError(errorMessage(err, "No fue posible cargar el historial.")));
  }, [fetchPage]);

  const loadMore = async () => {
    try {
      const data = await fetchPage(items[items.length - 1]?.createdAt);
      setItems((prev) => [...prev, ...(data.items || [])]);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar más movimientos."));
    }
  };

  return (
    <section style={embedded ? { padding: 0, marginTop: "2rem" } : undefined}>
      {embedded ? <h4>Historial de movimientos</h4> : <h3>Historial de inventario</h3>}
      {!embedded && product ? (
        <p>
          Filtrado por un producto. <Link to="/admin/inventory/movements">Ver todos</Link>
        </p>
      ) : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <label style={{ maxWidth: 260 }}>
        Motivo
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(MOVEMENT_REASON_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            {product ? null : <th>Producto</th>}
            <th>Motivo</th>
            <th>Cambio</th>
            <th>Quedó en</th>
            <th>Origen</th>
            <th>Usuario</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7}>Sin movimientos.</td>
            </tr>
          ) : null}
          {items.map((m) => {
            const link = refLink(m);
            return (
              <tr key={m._id}>
                <td>{formatDateTime(m.createdAt)}</td>
                {product ? null : (
                  <td>
                    {m.product?.name || "—"}
                    {m.variantLabel ? <small style={{ display: "block", opacity: 0.75 }}>{m.variantLabel}</small> : null}
                  </td>
                )}
                <td>{MOVEMENT_REASON_LABELS[m.reason] || m.reason}</td>
                <td>
                  <span className={`badge badge-${m.delta >= 0 ? "green" : "red"}`}>
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </span>
                </td>
                <td>{m.quantityAfter}</td>
                <td>
                  {link ? <Link to={link}>{m.refLabel || "Ver"}</Link> : m.refLabel || "—"}
                  {m.note ? <small style={{ display: "block", opacity: 0.75 }}>{m.note}</small> : null}
                </td>
                <td>{m.by?.name || (m.refKind === "Order" ? "Automático" : "—")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasMore ? (
        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={loadMore}>
          Cargar más
        </button>
      ) : null}
    </section>
  );
};

export default InventoryMovements;
