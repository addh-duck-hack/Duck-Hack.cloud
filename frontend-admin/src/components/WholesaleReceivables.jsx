import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { apiUrl, authHeaders, errorMessage, formatMxn, formatDate } from "../utils/storeFinance";
import Alert from "./Alert";

const BUCKETS = [
  ["current", "Al corriente"],
  ["d1_30", "1–30 días"],
  ["d31_60", "31–60 días"],
  ["d61plus", "Más de 60"],
];

// Cuentas por cobrar de mayoreo con antigüedad del saldo vencido.
const WholesaleReceivables = () => {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get(apiUrl("/api/wholesale/receivables"), { headers: authHeaders() })
      .then(({ data: body }) => setData(body))
      .catch((err) => setError(errorMessage(err, "No fue posible cargar las cuentas por cobrar.")));
  }, []);

  return (
    <section>
      <h3>Cuentas por cobrar</h3>
      <p>Saldo de las ventas de mayoreo entregadas, por antigüedad desde su vencimiento.</p>
      {error ? <Alert type="error">{error}</Alert> : null}

      {data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem", margin: "1rem 0" }}>
            {[["balance", "Total por cobrar"], ...BUCKETS].map(([key, label]) => (
              <div key={key}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--placeholder-color)", textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.4rem", fontWeight: 700, color: key !== "balance" && key !== "current" && data.totals[key] > 0 ? "var(--error-color)" : "var(--heading-color)" }}>
                  {formatMxn(data.totals[key])}
                </div>
              </div>
            ))}
          </div>

          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Saldo</th>
                {BUCKETS.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {data.customers.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nadie debe nada.</td>
                </tr>
              ) : null}
              {data.customers.map((row) => (
                <React.Fragment key={row.customer}>
                  <tr>
                    <td>
                      <Link to={`/admin/wholesale/customers/${row.customer}`}>{row.customerName}</Link>
                    </td>
                    <td>
                      <strong>{formatMxn(row.balance)}</strong>
                    </td>
                    {BUCKETS.map(([key]) => (
                      <td key={key}>{row[key] ? formatMxn(row[key]) : "—"}</td>
                    ))}
                    <td>
                      <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => setOpen(open === row.customer ? null : row.customer)}>
                        {open === row.customer ? "Ocultar" : `${row.sales.length} venta${row.sales.length === 1 ? "" : "s"}`}
                      </button>
                    </td>
                  </tr>
                  {open === row.customer
                    ? row.sales.map((s) => (
                        <tr key={s._id} style={{ opacity: 0.85 }}>
                          <td style={{ paddingLeft: "2rem" }}>
                            <Link to={`/admin/wholesale/sales/${s._id}`}>Venta #{s.folio}</Link>
                          </td>
                          <td>{formatMxn(s.balance)}</td>
                          <td colSpan={5}>
                            Entregada {formatDate(s.deliveredAt)} · vence {formatDate(s.dueDate)}
                            {s.daysLate > 0 ? <span className="badge badge-red" style={{ marginLeft: "0.5rem" }}>{s.daysLate} días vencida</span> : null}
                          </td>
                        </tr>
                      ))
                    : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
};

export default WholesaleReceivables;
