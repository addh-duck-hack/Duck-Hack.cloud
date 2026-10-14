import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl, authHeaders, errorMessage, formatMxn } from "../utils/storeFinance";
import Alert from "./Alert";

// Clientes mayoristas (modules/wholesale.js): negocios que le compran a la
// tienda por volumen, con su saldo pendiente y lo vencido.
const WholesaleCustomerList = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(apiUrl("/api/wholesale/customers"), {
        headers: authHeaders(),
        params: { q: q || undefined, active: showInactive ? undefined : "true" },
      });
      setCustomers(response.data?.customers || []);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar los clientes mayoristas."));
    } finally {
      setIsLoading(false);
    }
  }, [q, showInactive]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Clientes mayoristas</h3>
        <button type="button" onClick={() => navigate("/admin/wholesale/customers/new")} style={{ width: "auto" }}>
          Nuevo cliente
        </button>
      </div>
      <p>Negocios que le compran a la tienda por volumen, con su crédito y lo que deben.</p>

      {error ? <Alert type="error">{error}</Alert> : null}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ marginBottom: 0, flex: "1 1 240px" }}>
          Buscar
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Negocio, contacto o correo" />
        </label>
        <label style={{ marginBottom: 0, display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ width: "auto" }} />
          Incluir desactivados
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Negocio</th>
            <th>Contacto</th>
            <th>Crédito</th>
            <th>Descuento</th>
            <th>Saldo</th>
            <th>Vencido</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && customers.length === 0 ? (
            <tr>
              <td colSpan={6}>Sin clientes mayoristas.</td>
            </tr>
          ) : null}
          {customers.map((c) => (
            <tr key={c._id}>
              <td>
                <Link to={`/admin/wholesale/customers/${c._id}`}>{c.businessName}</Link>
                {c.isActive === false ? <span className="badge" style={{ marginLeft: "0.5rem" }}>Desactivado</span> : null}
              </td>
              <td>{[c.contactName, c.phone].filter(Boolean).join(" · ") || "—"}</td>
              <td>
                {c.creditDays ? `${c.creditDays} días` : "Contado"}
                {c.creditLimit !== null && c.creditLimit !== undefined ? ` · tope ${formatMxn(c.creditLimit)}` : ""}
              </td>
              <td>{c.discountPct ? `${c.discountPct} %` : "—"}</td>
              <td>{formatMxn(c.balance)}</td>
              <td>{c.overdue > 0 ? <span className="badge badge-red">{formatMxn(c.overdue)}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default WholesaleCustomerList;
