// src/ui/Payment.jsx — piezas de pago por transferencia que comparten el
// anticipo de una cita y la compra de una tarjeta de regalo: los datos SPEI
// para transferir y el formulario para subir el comprobante (foto o PDF).
import React, { useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { errorText, fmtShortDate, money } from '../utils/format';
import { Notice } from './bits';

const PROOF_STATUS = { pending: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado' };

// spei: { accountHolderName, bank, clabe }; concept: texto del concepto.
export const SpeiBox = ({ spei, amount, concept, dueText }) => {
  const [copied, setCopied] = useState(false);
  if (!spei) return <p className="muted">Escríbenos para darte los datos de la transferencia.</p>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(spei.clabe);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <dl className="attrs spei">
      {spei.accountHolderName ? <><dt>Titular</dt><dd>{spei.accountHolderName}</dd></> : null}
      {spei.bank ? <><dt>Banco</dt><dd>{spei.bank}</dd></> : null}
      <dt>CLABE</dt>
      <dd>
        {spei.clabe}{' '}
        <button type="button" className="link-btn" onClick={copy}>{copied ? 'Copiada' : 'Copiar'}</button>
      </dd>
      <dt>Monto</dt><dd><strong>{money(amount)}</strong></dd>
      {concept ? <><dt>Concepto</dt><dd>{concept}</dd></> : null}
      {dueText ? <><dt>Fecha límite</dt><dd>{dueText}</dd></> : null}
    </dl>
  );
};

// Lista de comprobantes enviados + formulario. `uploadPath` y `headers()` del
// recurso; `onUploaded(data)` recibe la respuesta del backend.
export const ProofUpload = ({ proofs = [], canUpload, uploadPath, headers, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ busy: false, error: '', ok: '' });
  const hasPending = proofs.some((p) => p.status === 'pending');

  const send = async (e) => {
    e.preventDefault();
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setState({ busy: false, error: 'El archivo pesa más de 8 MB.', ok: '' });
    setState({ busy: true, error: '', ok: '' });
    try {
      const body = new FormData();
      body.append('file', file);
      const data = await apiFetch(uploadPath, { method: 'POST', headers: headers(), body });
      setState({ busy: false, error: '', ok: data.message || 'Recibimos tu comprobante.' });
      setFile(null);
      e.target.reset();
      onUploaded?.(data);
    } catch (err) {
      setState({ busy: false, error: errorText(err), ok: '' });
    }
    return undefined;
  };

  return (
    <div className="stack">
      {proofs.length ? (
        <ul className="plain">
          {proofs.map((p) => (
            <li key={p._id}>
              Comprobante del {fmtShortDate(p.uploadedAt)} · <strong>{PROOF_STATUS[p.status]}</strong>
              {p.status === 'rejected' && p.rejectReason ? <small className="muted"> — {p.rejectReason}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {hasPending ? <p className="muted">Ya recibimos tu comprobante; te avisamos por correo en cuanto lo validemos.</p> : null}
      {canUpload && !hasPending ? (
        <form className="stack" onSubmit={send}>
          <label>
            Foto o PDF de tu transferencia (hasta 8 MB)
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button className="btn" disabled={!file || state.busy}>{state.busy ? 'Enviando…' : 'Enviar comprobante'}</button>
        </form>
      ) : null}
      <Notice type="error">{state.error}</Notice>
      <Notice type="success">{state.ok}</Notice>
    </div>
  );
};
