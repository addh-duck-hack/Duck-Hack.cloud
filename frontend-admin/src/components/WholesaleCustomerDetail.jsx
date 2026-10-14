import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiUrl, authHeaders, errorMessage, formatMxn, formatDate, Badge, SALE_STATUS, PAYMENT_STATUS, PAYMENT_METHOD_LABELS } from "../utils/storeFinance";
import Alert from "./Alert";

// Estado de cuenta de un cliente mayorista: datos, totales, ventas y
// cargos/abonos con saldo corrido (GET /api/wholesale/customers/:id/statement).
const WholesaleCustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await axios.get(apiUrl(`/api/wholesale/customers/${id}/statement`), { headers: authHeaders() });
      setData(response.data);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar el estado de cuenta."));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!window.confirm("¿Borrar este cliente? Solo se puede si no tiene ventas.")) return;
    try {
      await axios.delete(apiUrl(`/api/wholesale/customers/${id}`), { headers: authHeaders() });
      navigate("/admin/wholesale/customers");
    } catch (err) {
      setError(errorMessage(err, "No fue posible borrar el cliente."));
    }
  };

  if (!data) return <section>{error ? <Alert type="error">{error}</Alert> : <p>Cargando...</p>}</section>;
  const { customer, totals, entries, sales } = data;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>
          {customer.businessName}
          {customer.isActive === false ? <span className="badge" style={{ marginLeft: "0.5rem" }}>Desactivado</span> : null}
        </h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {customer.isActive !== false ? (
            <button type="button" style={{ width: "auto" }} onClick={() => navigate(`/admin/wholesale/sales/new?customer=${customer._id}`)}>
              Nueva venta
            </button>
          ) : null}
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => navigate(`/admin/wholesale/customers/${customer._id}/edit`)}>
            Editar
          </button>
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={handleDelete}>
            Borrar
          </button>
        </div>
      </div>

      {error ? <Alert type="error">{error}</Alert> : null}

      <p style={{ marginTop: "0.75rem" }}>
        {[customer.contactName, customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "Sin datos de contacto."}
        <br />
        Crédito: {customer.creditDays ? `${customer.creditDays} días` : "contado"}
        {customer.creditLimit !== null && customer.creditLimit !== undefined ? ` · límite ${formatMxn(customer.creditLimit)}` : ""}
        {customer.discountPct ? ` · descuento ${customer.discountPct} %` : ""}
        {customer.billingRfc ? ` · RFC ${customer.billingRfc}` : ""}
      </p>
      {customer.notes ? <p style={{ whiteSpace: "pre-wrap" }}>{customer.notes}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        {[
          ["Vendido", totals.sold],
          ["Pagado", totals.paid],
          ["Saldo", totals.balance],
          ["Vencido", totals.overdue],
        ].map(([label, value]) => (
          <div key={label}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--placeholder-color)", textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", fontWeight: 700, color: label === "Vencido" && value > 0 ? "var(--error-color, #d95926)" : "var(--heading-color)" }}>
              {formatMxn(value)}
            </div>
          </div>
        ))}
      </div>

      <h4 style={{ marginTop: "2rem" }}>Ventas</h4>
      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Total</th>
            <th>Saldo</th>
            <th>Vence</th>
            <th>Pago</th>
          </tr>
        </thead>
        <tbody>
          {sales.length === 0 ? (
            <tr>
              <td colSpan={7}>Sin ventas.</td>
            </tr>
          ) : null}
          {sales.map((s) => (
            <tr key={s._id}>
              <td>
                <Link to={`/admin/wholesale/sales/${s._id}`}>#{s.folio}</Link>
              </td>
              <td>{formatDate(s.deliveredAt || s.createdAt)}</td>
              <td>
                <Badge map={SALE_STATUS} value={s.status} />
              </td>
              <td>{formatMxn(s.total)}</td>
              <td>{s.status === "delivered" ? formatMxn(s.balance) : "—"}</td>
              <td>{s.status === "delivered" ? formatDate(s.dueDate) : "—"}</td>
              <td>{s.status === "delivered" ? <Badge map={PAYMENT_STATUS} value={s.paymentStatus} /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{ marginTop: "2rem" }}>Estado de cuenta</h4>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Cargo</th>
            <th>Abono</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={5}>Sin movimientos.</td>
            </tr>
          ) : null}
          {entries.map((e, i) => (
            <tr key={i}>
              <td>{formatDate(e.date)}</td>
              <td>
                {e.kind === "charge" ? `Venta #${e.folio}` : `Abono a venta #${e.folio}${e.method ? ` (${PAYMENT_METHOD_LABELS[e.method] || e.method})` : ""}`}
                {e.note ? ` — ${e.note}` : ""}
              </td>
              <td>{e.kind === "charge" ? formatMxn(e.amount) : ""}</td>
              <td>{e.kind === "payment" ? formatMxn(e.amount) : ""}</td>
              <td>{formatMxn(e.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default WholesaleCustomerDetail;
