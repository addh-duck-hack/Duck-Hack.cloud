// src/hooks/useContactForm.js
//
// Formulario de contacto -> POST /api/mail/send-email (módulo mail de
// packages/core-api, con rate limit por IP). `service` es el motivo de
// contacto que elige el usuario.
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

const INITIAL_FORM = { fullName: '', email: '', phone: '', service: '', message: '' };

export const useContactForm = () => {
  const [form, setForm] = useState(INITIAL_FORM);
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
