import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl, authHeaders, errorMessage, formatMxn, formatDate, Badge, PURCHASE_STATUS } from "../utils/storeFinance";
import Alert from "./Alert";

const PurchaseList = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [filters, setFilters] = useState({ supplier: searchParams.get("supplier") || "", status: "", paid: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = { supplier: filters.supplier || undefined, status: filters.status || undefined, paid: filters.paid || undefined };
      const response = await axios.get(apiUrl("/api/store-accounting/purchases"), { headers: authHeaders(), params });
      setPurchases(response.data?.purchases || []);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar las compras."));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    axios
      .get(apiUrl("/api/store-accounting/suppliers"), { headers: authHeaders() })
      .then(({ data }) => setSuppliers(data.suppliers || []))
      .catch(() => {});
  }, []);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Compras</h3>
        <button type="button" onClick={() => navigate("/admin/finance/purchases/new")} style={{ width: "auto" }}>
          Nueva compra
        </button>
      </div>
      <p>Lo que la tienda le compra a sus proveedores. Al recibirla sube el inventario; al pagarla se registra el gasto.</p>

      {error ? <Alert type="error">{error}</Alert> : null}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ marginBottom: 0 }}>
          Proveedor
          <select value={filters.supplier} onChange={setFilter("supplier")}>
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginBottom: 0 }}>
          Estado
          <select value={filters.status} onChange={setFilter("status")}>
            <option value="">Todos</option>
            {Object.entries(PURCHASE_STATUS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginBottom: 0 }}>
          Pago
          <select value={filters.paid} onChange={setFilter("paid")}>
            <option value="">Todos</option>
            <option value="false">Sin pagar</option>
            <option value="true">Pagadas</option>
          </select>
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Fecha</th>
            <th>Proveedor</th>
            <th>Referencia</th>
            <th>Estado</th>
            <th>Total</th>
            <th>Pago</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && purchases.length === 0 ? (
            <tr>
              <td colSpan={7}>Sin compras.</td>
            </tr>
          ) : null}
          {purchases.map((p) => (
            <tr key={p._id}>
              <td>
                <Link to={`/admin/finance/purchases/${p._id}`}>#{p.folio}</Link>
              </td>
              <td>{formatDate(p.date)}</td>
              <td>{p.supplierName}</td>
              <td>{p.reference || "—"}</td>
              <td>
                <Badge map={PURCHASE_STATUS} value={p.status} />
              </td>
              <td>{formatMxn(p.total)}</td>
              <td>{p.status === "cancelled" ? "—" : p.paidAt ? <span className="badge badge-green">Pagada {formatDate(p.paidAt)}</span> : <span className="badge badge-yellow">Sin pagar</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default PurchaseList;
