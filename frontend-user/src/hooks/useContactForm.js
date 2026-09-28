// src/hooks/useContactForm.js
//
// Formulario de contacto -> POST /api/mail/send-email (módulo mail de
// packages/core-api, con rate limit por IP). `service` es el motivo de
// contacto que elige el usuario; `initialReason` lo preselecciona (p. ej.
// /contacto?motivo=mayoreo desde "Hazte cliente mayorista").
import { useState } from 'react';
import { apiFetch } from '../utils/apiClient';

export const CONTACT_REASONS = [
  'Pedido / tienda en línea',
  'Mayoreo y cafeterías',
  'Suscripción mensual',
  'Visita a la finca',
  'Prensa o colaboración',
  'Otro',
];

// Claves cortas para enlazar a un motivo desde otras páginas (?motivo=).
export const CONTACT_REASON_KEYS = {
  pedido: 'Pedido / tienda en línea',
  mayoreo: 'Mayoreo y cafeterías',
  suscripcion: 'Suscripción mensual',
  visita: 'Visita a la finca',
  prensa: 'Prensa o colaboración',
};

const INITIAL_FORM = { fullName: '', email: '', phone: '', service: '', message: '' };

export const useContactForm = ({ initialReason = '' } = {}) => {
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM, service: CONTACT_REASON_KEYS[initialReason] || '' }));
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await apiFetch('/api/mail/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'No pudimos enviar el mensaje. Intenta más tarde.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setForm(INITIAL_FORM);
    setSubmitted(false);
    setError('');
  };

  return { form, onChange, onSubmit, submitted, error, isSubmitting, reset };
};
