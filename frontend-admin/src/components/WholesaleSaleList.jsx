import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl, authHeaders, errorMessage, formatMxn, formatDate, Badge, SALE_STATUS, PAYMENT_STATUS } from "../utils/storeFinance";
import Alert from "./Alert";

const WholesaleSaleList = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [filters, setFilters] = useState({ status: "", paymentStatus: "", overdue: false });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = {
        status: filters.status || undefined,
        paymentStatus: filters.paymentStatus || undefined,
        overdue: filters.overdue ? "true" : undefined,
      };
      const response = await axios.get(apiUrl("/api/wholesale/sales"), { headers: authHeaders(), params });
      setSales(response.data?.sales || []);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar las ventas."));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const now = Date.now();

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Ventas de mayoreo</h3>
        <button type="button" onClick={() => navigate("/admin/wholesale/sales/new")} style={{ width: "auto" }}>
          Nueva venta
        </button>
      </div>

      {error ? <Alert type="error">{error}</Alert> : null}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginTop: "1rem" }}>
        <label style={{ marginBottom: 0 }}>
          Estado
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Todas</option>
            {Object.entries(SALE_STATUS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginBottom: 0 }}>
          Pago
          <select value={filters.paymentStatus} onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value }))}>
            <option value="">Todos</option>
            {Object.entries(PAYMENT_STATUS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginBottom: 0, display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <input type="checkbox" checked={filters.overdue} onChange={(e) => setFilters((f) => ({ ...f, overdue: e.target.checked }))} style={{ width: "auto" }} />
          Solo vencidas
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Total</th>
            <th>Saldo</th>
            <th>Vence</th>
            <th>Pago</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && sales.length === 0 ? (
            <tr>
              <td colSpan={8}>Sin ventas.</td>
            </tr>
          ) : null}
          {sales.map((s) => {
            const overdue = s.status === "delivered" && s.balance > 0.004 && s.dueDate && +new Date(s.dueDate) < now;
            return (
              <tr key={s._id}>
                <td>
                  <Link to={`/admin/wholesale/sales/${s._id}`}>#{s.folio}</Link>
                </td>
                <td>
                  <Link to={`/admin/wholesale/customers/${s.customer}`}>{s.customerName}</Link>
                </td>
                <td>{formatDate(s.deliveredAt || s.createdAt)}</td>
                <td>
                  <Badge map={SALE_STATUS} value={s.status} />
                </td>
                <td>{formatMxn(s.total)}</td>
                <td>{s.status === "delivered" ? formatMxn(s.balance) : "—"}</td>
                <td>{s.status === "delivered" ? <span className={overdue ? "badge badge-red" : ""}>{formatDate(s.dueDate)}</span> : "—"}</td>
                <td>{s.status === "delivered" ? <Badge map={PAYMENT_STATUS} value={s.paymentStatus} /> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

export default WholesaleSaleList;
