import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";

// Comprobantes de pago SPEI de un pedido (packages/core-api/lib/paymentProofs.js):
// ver el archivo, aprobar (el pedido pasa a "Pagado" y descuenta inventario)
// o rechazar con motivo (se le envía al cliente), y subir uno a nombre del
// cliente cuando lo mandó por WhatsApp o correo. El archivo es privado: se
// descarga con el token y se muestra desde memoria (blob), nunca por URL
// pública.

const PROOF_STATUS = {
  pending: { label: "Por revisar", color: "yellow" },
  approved: { label: "Aprobado", color: "green" },
  rejected: { label: "Rechazado", color: "red" },
};
const AWAITING_PAYMENT = ["pending", "payment_review"];

const OrderPaymentProofs = ({ order, onChange }) => {
  const [preview, setPreview] = useState(null); // { proofId, url, isPdf }
  const [rejecting, setRejecting] = useState(null); // proofId
  const [reason, setReason] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
  const proofs = [...(order.paymentProofs || [])].reverse(); // el más reciente primero

  // Libera el blob al cambiar de vista previa o al salir.
  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  const showProof = async (proof) => {
    setError("");
    if (preview?.proofId === proof._id) {
      setPreview(null);
      return;
    }
    try {
      const response = await axios.get(`${baseUrl}/api/orders/${order._id}/payment-proofs/${proof._id}/file`, {
        headers: getAuthHeaders(),
        responseType: "blob",
      });
      setPreview({ proofId: proof._id, url: URL.createObjectURL(response.data), isPdf: proof.mimeType === "application/pdf" });
    } catch {
      setError("No fue posible abrir el comprobante.");
    }
  };

  const review = async (proof, decision) => {
    setBusy(true);
    setError("");
    try {
      const response = await axios.post(
        `${baseUrl}/api/orders/${order._id}/payment-proofs/${proof._id}/review`,
        decision === "reject" ? { decision, reason } : { decision },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setRejecting(null);
      setReason("");
      onChange(response.data.order, decision === "approve" ? "Comprobante aprobado: el pedido quedó como pagado." : "Comprobante rechazado: se le avisó al cliente.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible revisar el comprobante.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await axios.post(`${baseUrl}/api/orders/${order._id}/payment-proof`, body, { headers: getAuthHeaders() });
      setFile(null);
      event.target.reset();
      onChange(response.data.order, "Comprobante agregado: revísalo para aprobar el pago.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible subir el comprobante.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h4>Comprobantes de pago</h4>
      {error ? <div className="auth-error">{error}</div> : null}

      {proofs.length === 0 ? <p>Sin comprobantes todavía.</p> : null}
      {proofs.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Subido</th>
                <th>Por</th>
                <th>Archivo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proofs.map((proof) => {
                const info = PROOF_STATUS[proof.status] || { label: proof.status, color: "" };
                return (
                  <React.Fragment key={proof._id}>
                    <tr>
                      <td>{formatCalendarDate(proof.uploadedAt) || "—"}</td>
                      <td>{proof.uploadedBy === "staff" ? "Tienda" : "Cliente"}</td>
                      <td>{proof.mimeType === "application/pdf" ? "PDF" : "Imagen"}</td>
                      <td>
                        <span className={`badge badge-${info.color}`}>{info.label}</span>
                        {proof.status === "rejected" && proof.rejectReason ? (
                          <small style={{ display: "block", opacity: 0.8 }}>Motivo: {proof.rejectReason}</small>
                        ) : null}
                      </td>
                      <td style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => showProof(proof)}>
                          {preview?.proofId === proof._id ? "Ocultar" : "Ver"}
                        </button>
                        {proof.status === "pending" ? (
                          <>
                            <button type="button" style={{ width: "auto" }} disabled={busy} onClick={() => review(proof, "approve")}>
                              Aprobar
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ width: "auto" }}
                              disabled={busy}
                              onClick={() => {
                                setRejecting(rejecting === proof._id ? null : proof._id);
                                setReason("");
                              }}
                            >
                              Rechazar
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                    {rejecting === proof._id ? (
                      <tr>
                        <td colSpan={5}>
                          <label>
                            Motivo del rechazo (se le envía al cliente)
                            <input
                              type="text"
                              value={reason}
                              maxLength={500}
                              placeholder="Ej. El monto no coincide con el total del pedido"
                              onChange={(e) => setReason(e.target.value)}
                            />
                          </label>
                          <button type="button" style={{ width: "auto" }} disabled={busy || !reason.trim()} onClick={() => review(proof, "reject")}>
                            Confirmar rechazo
                          </button>
                        </td>
                      </tr>
                    ) : null}
                    {preview?.proofId === proof._id ? (
                      <tr>
                        <td colSpan={5}>
                          {preview.isPdf ? (
                            <>
                              <iframe title="Comprobante" src={preview.url} style={{ width: "100%", height: 480, border: 0, background: "#fff" }} />
                              <a href={preview.url} target="_blank" rel="noreferrer">
                                Abrir PDF en otra pestaña
                              </a>
                            </>
                          ) : (
                            <img src={preview.url} alt="Comprobante de pago" style={{ maxWidth: "100%", maxHeight: 600, borderRadius: 8 }} />
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {AWAITING_PAYMENT.includes(order.status) ? (
        <form onSubmit={upload} style={{ maxWidth: "none", margin: "1rem 0 0" }}>
          <label>
            Subir comprobante a nombre del cliente (JPG, PNG o PDF, máx. 8 MB)
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button type="submit" disabled={busy || !file} style={{ width: "auto" }}>
            {busy ? "Subiendo..." : "Subir comprobante"}
          </button>
        </form>
      ) : null}
    </div>
  );
};

export default OrderPaymentProofs;
