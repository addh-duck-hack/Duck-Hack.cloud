// src/hooks/useReviews.js
//
// Reseñas de producto, sin UI (packages/core-api/modules/reviews.js).
//   - useProductReviews(productId): las aprobadas de la ficha (paginadas, con
//     promedio y cuántas de cada estrella) y, con sesión, si el cliente puede
//     calificar y su propia reseña para crearla o editarla. Toda reseña entra
//     "en revisión": se publica cuando la tienda la aprueba.
//   - useMyReviews(): mis reseñas por producto, para "Calificar" / "Ya
//     calificaste" en Mis pedidos.
// El catálogo de muestra (ids que no son de Mongo) no tiene reseñas: no se
// consulta nada.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { useAuth } from './useAuth';

const PAGE_SIZE = 5;
const MAX_COMMENT = 1000;
const isApiId = (id) => /^[a-f0-9]{24}$/i.test(String(id || ''));

const EMPTY_SUMMARY = { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

export const REVIEW_STATUS_LABELS = {
  pending: 'En revisión',
  approved: 'Publicada',
  rejected: 'No publicada',
};

export const useProductReviews = (productId) => {
  const auth = useAuth();
  const enabled = isApiId(productId);

  // ---- Públicas ----
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  const fetchPage = useCallback(
    (n) => apiFetch(`/api/reviews/public?product=${productId}&page=${n}&limit=${PAGE_SIZE}`),
    [productId]
  );

  useEffect(() => {
    setItems([]);
    setSummary(EMPTY_SUMMARY);
    setPage(1);
    setTotal(0);
    setLoadError('');
    if (!enabled) {
      setIsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    fetchPage(1)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items || []);
        setSummary(data.summary || EMPTY_SUMMARY);
        setTotal(data.total || 0);
      })
      .catch(() => !cancelled && setLoadError('No pudimos cargar las reseñas.'))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled, fetchPage]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const data = await fetchPage(page + 1);
      setItems((prev) => [...prev, ...(data.items || [])]);
      setPage(page + 1);
      setTotal(data.total || 0);
    } catch {
      setLoadError('No pudimos cargar más reseñas.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // ---- Mi reseña (con sesión) ----
  // eligibility: null = sin revisar (o sin sesión); { eligible, reason }.
  const [eligibility, setEligibility] = useState(null);
  const [mine, setMine] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ rating: 0, comment: '' });
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const authHeader = useCallback(() => ({ Authorization: `Bearer ${auth.token}` }), [auth.token]);

  useEffect(() => {
    setEligibility(null);
    setMine(null);
    setIsEditing(false);
    setForm({ rating: 0, comment: '' });
    setFormError('');
    setFormMessage('');
    if (!enabled || !auth.isAuthenticated) return undefined;
    let cancelled = false;
    apiFetch(`/api/reviews/eligibility?product=${productId}`, { headers: authHeader() })
      .then((data) => {
        if (cancelled) return;
        setEligibility({ eligible: Boolean(data.eligible), reason: data.reason || '' });
        setMine(data.review || null);
      })
      .catch(() => !cancelled && setEligibility(null));
    return () => {
      cancelled = true;
    };
  }, [enabled, productId, auth.isAuthenticated, authHeader]);

  const startEditing = () => {
    setForm({ rating: mine?.rating || 0, comment: mine?.comment || '' });
    setFormError('');
    setFormMessage('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setFormError('');
  };

  const setRating = (rating) => {
    setFormError('');
    setForm((prev) => ({ ...prev, rating }));
  };

  const setComment = (comment) => setForm((prev) => ({ ...prev, comment: comment.slice(0, MAX_COMMENT) }));

  const submit = async (event) => {
    event?.preventDefault();
    if (!(form.rating >= 1 && form.rating <= 5)) {
      setFormError('Elige de 1 a 5 estrellas.');
      return;
    }
    setFormError('');
    setIsSaving(true);
    try {
      const body = JSON.stringify({ product: productId, rating: form.rating, comment: form.comment.trim() });
      const headers = { ...authHeader(), 'Content-Type': 'application/json' };
      const data = mine
        ? await apiFetch(`/api/reviews/mine/${mine._id}`, { method: 'PUT', headers, body })
        : await apiFetch('/api/reviews', { method: 'POST', headers, body });
      // Si estaba publicada, deja de verse hasta que la aprueben otra vez.
      if (mine?.status === 'approved') {
        setItems((prev) => prev.filter((r) => r._id !== mine._id));
      }
      setMine(data.review);
      setIsEditing(false);
      setFormMessage(data.message || '¡Gracias por tu reseña!');
    } catch (err) {
      setFormError(err.message || 'No pudimos guardar tu reseña. Intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    enabled,
    isAuthenticated: auth.isAuthenticated,
    items,
    summary,
    total,
    hasMore: items.length < total,
    isLoading,
    isLoadingMore,
    loadError,
    loadMore,
    eligibility,
    mine,
    // Formulario abierto: primera reseña de alguien elegible, o editando.
    showForm: Boolean(eligibility?.eligible) && (!mine || isEditing),
    isEditing,
    startEditing,
    cancelEditing,
    form,
    setRating,
    setComment,
    maxComment: MAX_COMMENT,
    submit,
    isSaving,
    formError,
    formMessage,
  };
};

// Mis reseñas por id de producto (string), para Mis pedidos.
export const useMyReviews = () => {
  const auth = useAuth();
  const [byProduct, setByProduct] = useState({});

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setByProduct({});
      return undefined;
    }
    let cancelled = false;
    apiFetch('/api/reviews/mine', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then((data) => {
        if (cancelled) return;
        setByProduct(Object.fromEntries((data.items || []).map((r) => [String(r.product), r])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, auth.token]);

  return byProduct;
};
