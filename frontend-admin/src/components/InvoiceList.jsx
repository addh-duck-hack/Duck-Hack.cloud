import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const formatDate = (value) => formatCalendarDate(value) || "—";

const SOURCE_LABELS = {
  manual: "Manual",
  hosting_payment: "Pago de hosting",
  design_debt: "Deuda de diseño",
};

const InvoiceList = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientFilter, setClientFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadInvoices = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = {};
      if (clientFilter) params.client = clientFilter;
      const response = await axios.get(`${baseUrl}/api/invoices`, { headers: getAuthHeaders(), params });
      setInvoices(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar las facturas.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFilter]);

  const loadClients = useCallback(async () => {
    try {
      const response = await axios.get(`${baseUrl}/api/agency-clients`, { headers: getAuthHeaders() });
      setClients(response.data?.items || []);
    } catch {
      // El filtro de cliente solo queda vacío si esto falla — no bloquea el listado.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // El endpoint de PDF exige el Bearer token, así que no puede ser un <a href>
  // normal (el navegador no le manda headers custom) — se pide como blob y se
  // abre en pestaña nueva, donde el visor de PDF del navegador se hace cargo.
  const handleViewPdf = async (invoice) => {
    setDownloadingId(invoice._id);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/invoices/${invoice._id}/pdf`, {
        headers: getAuthHeaders(),
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError("No fue posible generar el PDF de la factura.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Facturación</h3>
        <button type="button" onClick={() => navigate("/admin/invoices/new")} style={{ width: "auto" }}>
          Nueva factura
        </button>
      </div>
      <p>Comprobantes de pago en PDF sin validez fiscal.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <label style={{ maxWidth: 300 }}>
        Filtrar por cliente
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>
              {c.businessName}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Cliente</th>
            <th>Concepto</th>
            <th>Monto</th>
            <th>Fecha</th>
            <th>Origen</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && invoices.length === 0 ? (
            <tr>
              <td colSpan={7}>Sin facturas registradas.</td>
            </tr>
          ) : null}
          {invoices.map((invoice) => (
            <tr key={invoice._id}>
              <td>{String(invoice.folio).padStart(6, "0")}</td>
              <td>{invoice.client?.businessName || "—"}</td>
              <td>{invoice.concept}</td>
              <td>{formatMxn(invoice.amount)}</td>
              <td>{formatDate(invoice.issuedAt)}</td>
              <td>{SOURCE_LABELS[invoice.source] || invoice.source}</td>
              <td>
                <button type="button" onClick={() => handleViewPdf(invoice)} disabled={downloadingId === invoice._id}>
                  {downloadingId === invoice._id ? "Generando..." : "Ver PDF"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default InvoiceList;
