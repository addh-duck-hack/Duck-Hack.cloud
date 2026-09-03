import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatMxn } from "../utils/accountingLabels";

// Edición acotada de una factura ya emitida: concepto de cada movimiento y
// fecha de emisión. El monto, el cliente, el folio y qué movimientos cubre no
// se tocan (ver backend/routes/invoices.routes.js PUT /:id) — para eso se
// cancela y se re-emite.
const InvoiceEditForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const [invoice, setInvoice] = useState(null);
  const [itemConcepts, setItemConcepts] = useState([]);
  const [issuedAt, setIssuedAt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isViewingPdf, setIsViewingPdf] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadInvoice = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/invoices/${id}`, { headers: getAuthHeaders() });
      const data = response.data?.invoice;
      setInvoice(data);
      setItemConcepts((data?.items || []).map((item) => item.concept));
      setIssuedAt(data?.issuedAt ? data.issuedAt.slice(0, 10) : "");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar la factura.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  const hasItems = (invoice?.items?.length || 0) > 0;
  const total = useMemo(
    () => (invoice?.items || []).reduce((sum, item) => sum + item.amount, 0),
    [invoice]
  );

  const handleConceptChange = (index, value) => {
    setItemConcepts((prev) => prev.map((concept, i) => (i === index ? value : concept)));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (hasItems && itemConcepts.some((concept) => !concept.trim())) {
      setError("Cada movimiento necesita un concepto.");
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = { issuedAt: issuedAt || undefined };
      if (hasItems) payload.items = itemConcepts.map((concept) => ({ concept: concept.trim() }));

      const response = await axios.put(`${baseUrl}/api/invoices/${id}`, payload, {
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      setInvoice(response.data?.invoice);
      setMessage("Factura actualizada. Ya puedes volver a imprimirla.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible actualizar la factura.");
    } finally {
      setIsSaving(false);
    }
  };

  // Mismo patrón que InvoiceList: el endpoint de PDF exige el Bearer token, así
  // que se pide como blob y se abre en pestaña nueva.
  const handleViewPdf = async () => {
    setIsViewingPdf(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/invoices/${id}/pdf`, {
        headers: getAuthHeaders(),
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError("No fue posible generar el PDF de la factura.");
    } finally {
      setIsViewingPdf(false);
    }
  };

  if (isLoading) return <section><p>Cargando factura...</p></section>;

  if (!invoice) {
    return (
      <section>
        {error ? <div className="auth-error">{error}</div> : null}
        <button type="button" className="btn-secondary" onClick={() => navigate("/admin/invoices")}>
          Volver a Facturación
        </button>
      </section>
    );
  }

  return (
    <section>
      <h3>Editar factura {String(invoice.folio).padStart(6, "0")}</h3>
      <p>
        Cliente: <strong>{invoice.client?.businessName || "—"}</strong>. Solo se pueden editar los conceptos y la
        fecha de emisión; el monto y los movimientos cubiertos quedan fijos.
      </p>

      {error ? <div className="auth-error">{error}</div> : null}
      {message ? <div className="auth-success">{message}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: 700, margin: 0 }}>
        <label>
          Fecha de emisión
          <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </label>

        {hasItems ? (
          <table>
            <thead>
              <tr>
                <th>Concepto (se imprime en la factura)</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="text"
                      value={itemConcepts[index] ?? ""}
                      onChange={(e) => handleConceptChange(index, e.target.value)}
                      maxLength={300}
                      style={{ margin: 0, minWidth: 320 }}
                      required
                    />
                  </td>
                  <td>{formatMxn(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>
            Esta factura no tiene desglose por movimiento (factura antigua). Concepto:{" "}
            <strong>{invoice.concept}</strong>.
          </p>
        )}

        <p>
          <strong>Total: {formatMxn(total || invoice.amount)}</strong>
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
          <button type="button" onClick={handleViewPdf} disabled={isViewingPdf} style={{ width: "auto" }}>
            {isViewingPdf ? "Generando..." : "Ver PDF"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/invoices")}>
            Volver
          </button>
        </div>
      </form>
    </section>
  );
};

export default InvoiceEditForm;
