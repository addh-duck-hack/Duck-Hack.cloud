// src/components/PaymentProofPanel.jsx — comprobantes de pago de un pedido:
// los que ya se mandaron (en revisión / aprobado / rechazado con motivo) y el
// formulario para subir uno (foto o PDF). La lógica vive en
// hooks/useOrderAccess.js#usePaymentProofUpload; lo usan la página del pedido
// (/pedido/:id) y "Mis pedidos". Usa las clases acc-* de pages/Account.css.
import React, { useId, useState } from 'react';
import { formatDate } from '../hooks/useAccount';
import { PROOF_ACCEPT } from '../hooks/useOrderAccess';

const PROOF_STATUS = {
  pending: { label: 'En revisión', icon: 'fa-solid fa-hourglass-half', className: 'is-payment_review' },
  approved: { label: 'Aprobado', icon: 'fa-solid fa-circle-check', className: 'is-delivered' },
  rejected: { label: 'Rechazado', icon: 'fa-solid fa-circle-xmark', className: 'is-cancelled' },
};

// `proofs`: [{ _id, status, uploadedAt, rejectReason }]; `canUpload`: el
// pedido sigue esperando su pago; `uploader`: usePaymentProofUpload().
const PaymentProofPanel = ({ proofs = [], canUpload, uploader }) => {
  const inputId = useId();
  const [file, setFile] = useState(null);
  const sorted = [...proofs].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const lastRejected = sorted[0]?.status === 'rejected' ? sorted[0] : null;
  const hasPending = sorted.some((p) => p.status === 'pending');

  const onSubmit = async (event) => {
    event.preventDefault();
    const ok = await uploader.upload(file);
    if (ok) {
      setFile(null);
      event.target.reset();
    }
  };

  if (!canUpload && sorted.length === 0) return null;

  return (
    <div className="acc-proofs">
      {sorted.length > 0 ? (
        <ul className="acc-proof-list">
          {sorted.map((proof) => {
            const info = PROOF_STATUS[proof.status] || PROOF_STATUS.pending;
            return (
              <li key={proof._id}>
                <span>
                  <i className={info.icon} aria-hidden="true" /> Comprobante del {formatDate(proof.uploadedAt)}
                  {proof.status === 'rejected' && proof.rejectReason ? <small>Motivo: {proof.rejectReason}</small> : null}
                </span>
                <span className={`acc-status ${info.className}`}>{info.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hasPending ? (
        <p className="acc-muted">Ya recibimos tu comprobante. Te avisaremos por correo cuando confirmemos el pago.</p>
      ) : null}

      {canUpload && !hasPending ? (
        <form className="acc-proof-form" onSubmit={onSubmit}>
          <label htmlFor={inputId}>
            {lastRejected ? 'Sube un nuevo comprobante' : '¿Ya hiciste tu transferencia? Sube tu comprobante'}
            <small>Foto o captura (JPG, PNG) o el PDF de tu banco, hasta 8 MB.</small>
          </label>
          <input
            id={inputId}
            type="file"
            accept={PROOF_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={uploader.isUploading}
          />
          <button type="submit" className="acc-btn" disabled={!file || uploader.isUploading}>
            <i className="fa-solid fa-upload" aria-hidden="true" /> {uploader.isUploading ? 'Enviando…' : 'Enviar comprobante'}
          </button>
        </form>
      ) : null}

      {uploader.error ? (
        <p className="acc-alert acc-alert--error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{uploader.error}</span>
        </p>
      ) : null}
      {uploader.success ? (
        <p className="acc-alert acc-alert--success" role="status">
          <i className="fa-solid fa-circle-check" aria-hidden="true" />
          <span>{uploader.success}</span>
        </p>
      ) : null}
    </div>
  );
};

export default PaymentProofPanel;
