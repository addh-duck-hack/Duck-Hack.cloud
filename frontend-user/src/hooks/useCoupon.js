// src/hooks/useCoupon.js
//
// Cupón de descuento en el checkout, sin UI. Valida contra
// POST /api/coupons/validate (packages/core-api/modules/coupons.js) y guarda
// el resultado como vista previa: el total real lo recalcula el backend al
// crear el pedido con `couponCode` (useCart#submitOrder). Si cambia el
// subtotal o la entrega, el cupón aplicado se vuelve a validar (puede dejar
// de cumplir la compra mínima, o ser de envío gratis y el pedido pasar a
// "recoger"); si ya no sirve, se quita y se avisa por qué.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';

// Sin respuesta del backend: mensaje entendible en lugar de "Failed to fetch".
const errorMessage = (err) =>
  err?.status ? err.message : 'No pudimos revisar el cupón. Revisa tu conexión e intenta de nuevo.';

export const useCoupon = ({ subtotal, deliveryMethod, customerEmail }) => {
  const [input, setInput] = useState('');
  const [applied, setApplied] = useState(null); // { code, type, discount, freeShipping, message }
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const requestId = useRef(0);

  const check = useCallback(
    (code) =>
      apiFetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal, deliveryMethod: deliveryMethod || undefined, customerEmail: customerEmail || undefined }),
      }),
    [subtotal, deliveryMethod, customerEmail]
  );

  const apply = async (event) => {
    event?.preventDefault();
    const code = input.trim();
    if (!code) return;
    setError('');
    setIsChecking(true);
    const id = ++requestId.current;
    try {
      const data = await check(code);
      if (id !== requestId.current) return;
      setApplied({ code: data.code, type: data.type, discount: data.discount, freeShipping: data.freeShipping, message: data.message });
      setInput('');
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setIsChecking(false);
    }
  };

  const remove = useCallback((reason = '') => {
    requestId.current += 1;
    setApplied(null);
    setError(reason);
  }, []);

  // Revalidar el cupón aplicado cuando cambia lo que lo condiciona. Con
  // espera, para no gastar el rate limit del endpoint (30 / 10 min) mientras
  // el cliente sube cantidades con el botón +. La primera corrida (justo al
  // aplicarlo) se salta: ese resultado ya está fresco.
  const appliedCode = applied?.code;
  const checkedWith = useRef(null);
  useEffect(() => {
    if (!appliedCode) {
      checkedWith.current = null;
      return undefined;
    }
    if (checkedWith.current === null) {
      checkedWith.current = check;
      return undefined;
    }
    if (checkedWith.current === check) return undefined;
    checkedWith.current = check;
    let cancelled = false;
    const timer = setTimeout(() => {
      const id = ++requestId.current;
      check(appliedCode)
        .then((data) => {
          if (cancelled || id !== requestId.current) return;
          setApplied({ code: data.code, type: data.type, discount: data.discount, freeShipping: data.freeShipping, message: data.message });
        })
        .catch((err) => {
          if (cancelled || id !== requestId.current || !err?.status) return; // sin conexión: se deja como estaba
          setApplied(null);
          setError(`Quitamos el cupón ${appliedCode}: ${err.message}`);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [appliedCode, check]);

  return {
    input,
    setInput: (value) => {
      setError('');
      setInput(value.toUpperCase().replace(/\s/g, ''));
    },
    applied,
    discount: applied?.discount || 0,
    freeShipping: Boolean(applied?.freeShipping),
    error,
    isChecking,
    apply,
    remove,
  };
};
