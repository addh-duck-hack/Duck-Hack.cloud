// src/hooks/useCheckout.js
//
// Checkout de /carrito, sin UI. Cuatro pasos + confirmación:
//   0 Canasta   — productos, descuentos, totales y sugerencias.
//   1 Entrega   — envío a domicilio o recoger en un punto de venta.
//   2 Tus datos — con sesión: contacto + libreta de direcciones; sin sesión:
//                 iniciar sesión, crear cuenta o comprar como invitado.
//   3 Pago      — métodos de pago que aplican a la entrega elegida + notas.
//   4 ¡Gracias! — folio y lo que sigue.
//
// Las opciones de entrega y pago salen de StoreConfig (pestaña "Entrega y
// pago" del admin, GET /api/store-config/public). El pedido va por
// POST /api/orders/public (useCart#submitOrder), que valida todo contra la
// misma configuración y recalcula envío y total. Sin pasarela de pago: entra
// "pendiente" y la tienda confirma el pago a mano.
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { EMPTY_SHIPPING_ADDRESS, SHIPPING_ADDRESS_FIELDS, pickShippingAddress } from '../utils/address';
import { useAuth } from './useAuth';
import { useCart } from './useCart';
import { useStoreConfig } from './useStoreConfig';
import { useLoginForm, useRegisterForm } from './useAuthForms';

export const CHECKOUT_STEPS = ['Canasta', 'Entrega', 'Tus datos', 'Pago'];
export const DONE_STEP = CHECKOUT_STEPS.length;

// Si la configuración no carga, lo mismo que ofrece el backend por default
// (packages/core-api/lib/checkoutOptions.js#DEFAULT_PAYMENT_METHODS).
const FALLBACK_PAYMENT_METHODS = [
  {
    _id: 'transfer',
    type: 'spei',
    label: 'Transferencia / SPEI',
    description: 'Te enviamos los datos por correo y confirmamos al recibir el pago.',
    instructions: '',
    forShipping: true,
    forPickup: true,
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INITIAL_CONTACT = { customerName: '', customerEmail: '', customerPhone: '' };

export const formatOrderFolio = (orderNumber) => `TAC-${String(orderNumber ?? '').padStart(5, '0')}`;

// Enlace a Google Maps de un punto de venta con coordenadas.
export const mapsHref = (point) =>
  point?.lat != null && point?.lng != null ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}` : '';

const appliesTo = (method, deliveryMethod) =>
  deliveryMethod === 'pickup' ? method.forPickup !== false : method.forShipping !== false;

// Opciones de entrega y pago de la tienda, ya filtradas a lo activo por el
// backend.
export const useCheckoutOptions = () => {
  const { config, isLoading } = useStoreConfig();
  return useMemo(
    () => ({
      isLoading,
      homeDeliveryEnabled: config?.homeDeliveryEnabled !== false,
      pickupPoints: config?.pickupPoints || [],
      paymentMethods: config?.paymentMethods?.length ? config.paymentMethods : config ? [] : FALLBACK_PAYMENT_METHODS,
    }),
    [config, isLoading]
  );
};

export const useCheckout = () => {
  const cart = useCart();
  const auth = useAuth();
  const options = useCheckoutOptions();

  const [step, setStepState] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const [pickupPointId, setPickupPointId] = useState('');
  const [contact, setContact] = useState(INITIAL_CONTACT);
  const [shippingAddress, setShippingAddress] = useState(EMPTY_SHIPPING_ADDRESS);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [notes, setNotes] = useState('');
  const [stepError, setStepError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [order, setOrder] = useState(null);
  // Resumen de la canasta al confirmar (la canasta se vacía al crear el
  // pedido; la confirmación lo sigue mostrando).
  const [placedSummary, setPlacedSummary] = useState(null);

  // Libreta de direcciones (solo con sesión).
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [isSavingNewAddress, setIsSavingNewAddress] = useState(false);
  const [newAddressError, setNewAddressError] = useState('');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const loadedForUserRef = useRef('');

  const setStep = (next) => {
    setStepError('');
    setStepState(next);
    window.scrollTo(0, 0);
  };

  // ---- Entrega ----
  const pickupPoint = options.pickupPoints.find((p) => p._id === pickupPointId) || null;
  const hasPickup = options.pickupPoints.length > 0;
  const hasDeliveryOption = options.homeDeliveryEnabled || hasPickup;

  // Una sola opción posible → se preselecciona (cuando ya cargó la
  // configuración; antes parecería que solo hay envío a domicilio).
  useEffect(() => {
    if (deliveryMethod || options.isLoading) return;
    if (options.homeDeliveryEnabled && !hasPickup) setDeliveryMethod('shipping');
    else if (!options.homeDeliveryEnabled && options.pickupPoints.length === 1) {
      setDeliveryMethod('pickup');
      setPickupPointId(options.pickupPoints[0]._id);
    }
  }, [deliveryMethod, options.isLoading, options.homeDeliveryEnabled, hasPickup, options.pickupPoints]);

  const chooseShipping = () => {
    setStepError('');
    setDeliveryMethod('shipping');
  };

  const choosePickupPoint = (id) => {
    setStepError('');
    setDeliveryMethod('pickup');
    setPickupPointId(id);
  };

  // ---- Pago ----
  const availablePaymentMethods = useMemo(
    () => (deliveryMethod ? options.paymentMethods.filter((m) => appliesTo(m, deliveryMethod)) : []),
    [options.paymentMethods, deliveryMethod]
  );
  const paymentMethod = availablePaymentMethods.find((m) => m._id === paymentMethodId) || null;

  // Si el método elegido ya no aplica a la entrega (o no hay ninguno), se
  // toma el primero disponible.
  useEffect(() => {
    if (!availablePaymentMethods.length) return;
    if (!availablePaymentMethods.some((m) => m._id === paymentMethodId)) {
      setPaymentMethodId(availablePaymentMethods[0]._id);
    }
  }, [availablePaymentMethods, paymentMethodId]);

  // ---- Totales según la entrega ----
  const shipping = deliveryMethod ? cart.shippingFor(deliveryMethod) : null;
  const total = cart.subtotal + (shipping || 0);

  // ---- Tus datos ----
  // Al corregir un campo se quita el aviso del paso (se vuelve a validar al
  // continuar).
  const onContactChange = (e) => {
    const { name, value } = e.target;
    setStepError('');
    setContact((prev) => ({ ...prev, [name]: value }));
  };

  const onAddressFieldChange = (e) => {
    const { name, value } = e.target;
    setStepError('');
    setShippingAddress((prev) => ({ ...prev, [name]: value }));
  };

  const prefillContact = ({ customerName, customerEmail, customerPhone }) => {
    setContact((prev) => ({
      customerName: customerName || prev.customerName,
      customerEmail: customerEmail || prev.customerEmail,
      customerPhone: customerPhone || prev.customerPhone,
    }));
  };

  const applyAddress = (address) => {
    setSelectedAddressId(address?._id || '');
    const picked = pickShippingAddress(address);
    if (picked) setShippingAddress(picked);
  };

  // Con predeterminada → se preselecciona; si no, ninguna (hay que elegir).
  const syncAddressesFromUser = (user) => {
    const list = user?.addresses || [];
    setAddresses(list);
    setShowNewAddressForm(list.length === 0);
    const defaultAddress = list.find((a) => a.isDefault) || (list.length === 1 ? list[0] : null);
    if (defaultAddress) applyAddress(defaultAddress);
    else {
      setSelectedAddressId('');
      setShippingAddress(EMPTY_SHIPPING_ADDRESS);
    }
  };

  // Con sesión: contacto de la cuenta + libreta fresca del servidor
  // (auth.user es la foto del login y puede estar vieja). Una vez por
  // usuario.
  useEffect(() => {
    if (!auth.isAuthenticated || loadedForUserRef.current === auth.user._id) return;
    loadedForUserRef.current = auth.user._id;
    prefillContact({ customerName: auth.user.name, customerEmail: auth.user.email, customerPhone: auth.user.phone });
    setIsLoadingAddresses(true);
    apiFetch(`/api/users/${auth.user._id}`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then((freshUser) => {
        syncAddressesFromUser(freshUser);
        prefillContact({ customerName: freshUser?.name, customerPhone: freshUser?.phone });
      })
      .catch(() => syncAddressesFromUser(auth.user))
      .finally(() => setIsLoadingAddresses(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated, auth.user?._id]);

  // "¿No eres tú?": cierra sesión y vuelve a las opciones de cuenta.
  const forgetAccount = () => {
    auth.logout();
    loadedForUserRef.current = '';
    setAddresses([]);
    setSelectedAddressId('');
    setShowNewAddressForm(false);
    setContact(INITIAL_CONTACT);
    setShippingAddress(EMPTY_SHIPPING_ADDRESS);
  };

  const selectSavedAddress = (address) => {
    setStepError('');
    setShowNewAddressForm(false);
    applyAddress(address);
  };

  const openNewAddressForm = () => {
    setSelectedAddressId('');
    setShippingAddress(EMPTY_SHIPPING_ADDRESS);
    setShowNewAddressForm(true);
  };

  const cancelNewAddressForm = () => {
    setShowNewAddressForm(false);
    setNewAddressError('');
    const fallback = addresses.find((a) => a.isDefault) || addresses[0];
    if (fallback) applyAddress(fallback);
  };

  // Con sesión, la dirección nueva se guarda en la libreta para la próxima.
  const saveNewAddress = async () => {
    const missing = missingAddressFields(shippingAddress);
    if (missing.length) {
      setNewAddressError(`Completa: ${missing.join(', ')}.`);
      return;
    }
    setNewAddressError('');
    setIsSavingNewAddress(true);
    try {
      const data = await apiFetch(`/api/users/${auth.user._id}/addresses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(shippingAddress),
      });
      const updated = data.user?.addresses || [];
      setAddresses(updated);
      // El backend agrega al final: la recién creada es la última.
      const created = updated[updated.length - 1];
      if (created) applyAddress(created);
      setShowNewAddressForm(false);
    } catch (err) {
      setNewAddressError(err.message || 'No fue posible guardar la dirección.');
    } finally {
      setIsSavingNewAddress(false);
    }
  };

  // ---- Validación por paso ----
  const validateStep = (index) => {
    if (index === 0) {
      if (!cart.lines.length) return 'Tu canasta está vacía.';
    }
    if (index === 1) {
      if (!hasDeliveryOption) return 'Por ahora no hay formas de entrega disponibles. Contáctanos para completar tu pedido.';
      if (!deliveryMethod) return 'Elige cómo quieres recibir tu pedido.';
      if (deliveryMethod === 'pickup' && hasPickup && !pickupPoint) return 'Elige el punto de venta donde recogerás tu pedido.';
    }
    if (index === 2) {
      const missing = [];
      if (!contact.customerName.trim()) missing.push('nombre');
      if (!EMAIL_REGEX.test(contact.customerEmail.trim())) missing.push('correo válido');
      if (contact.customerPhone.replace(/\D/g, '').length < 10) missing.push('teléfono de 10 dígitos');
      if (missing.length) return `Completa tus datos: ${missing.join(', ')}.`;
      if (deliveryMethod === 'shipping') {
        if (auth.isAuthenticated && showNewAddressForm) return 'Guarda la dirección nueva o elige una de tus direcciones.';
        const missingAddress = missingAddressFields(shippingAddress);
        if (missingAddress.length) {
          return auth.isAuthenticated && addresses.length && !selectedAddressId
            ? 'Elige la dirección de entrega.'
            : `Completa la dirección de entrega: ${missingAddress.join(', ')}.`;
        }
      }
    }
    if (index === 3) {
      if (!paymentMethod) return 'Elige un método de pago.';
    }
    return '';
  };

  const goNext = () => {
    const error = validateStep(step);
    if (error) {
      setStepError(error);
      return;
    }
    setStep(step + 1);
  };

  const goBack = () => setStep(Math.max(0, step - 1));

  // El stepper deja volver a cualquier paso anterior, y avanzar solo si los
  // pasos de en medio están completos.
  const goToStep = (target) => {
    if (target <= step) {
      setStep(target);
      return;
    }
    for (let i = step; i < target; i += 1) {
      const error = validateStep(i);
      if (error) {
        setStep(i);
        setStepError(error);
        return;
      }
    }
    setStep(target);
  };

  // ---- Confirmar ----
  const submitOrder = async (e) => {
    e?.preventDefault();
    for (let i = 0; i < DONE_STEP; i += 1) {
      const error = validateStep(i);
      if (error) {
        setStep(i);
        setStepError(error);
        return;
      }
    }
    setStepError('');
    setIsSubmitting(true);
    try {
      const summary = { count: cart.count, subtotal: cart.subtotal, savings: cart.savings };
      const created = await cart.submitOrder({
        ...contact,
        shippingAddress,
        deliveryMethod,
        pickupPointId: pickupPoint?._id,
        paymentMethod: paymentMethod._id,
        notes,
      });
      setPlacedSummary(summary);
      setOrder(created);
      cart.clear();
      setStep(DONE_STEP);
    } catch (err) {
      setStepError(err.message || 'No fue posible enviar tu pedido. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    cart,
    auth,
    options,
    step,
    steps: CHECKOUT_STEPS,
    isDone: step === DONE_STEP,
    isCartEmpty: cart.lines.length === 0 && step !== DONE_STEP,
    goNext,
    goBack,
    goToStep,
    stepError,

    // Totales según la entrega elegida (shipping null = aún sin elegir).
    shipping,
    total,

    // Entrega
    deliveryMethod,
    pickupPoint,
    hasPickup,
    hasDeliveryOption,
    chooseShipping,
    choosePickupPoint,

    // Tus datos
    contact,
    onContactChange,
    prefillContact,
    shippingAddress,
    onAddressFieldChange,
    forgetAccount,
    addresses,
    selectedAddressId,
    selectSavedAddress,
    showNewAddressForm,
    openNewAddressForm,
    cancelNewAddressForm,
    saveNewAddress,
    isSavingNewAddress,
    newAddressError,
    isLoadingAddresses,

    // Pago
    availablePaymentMethods,
    paymentMethod,
    setPaymentMethodId: (id) => {
      setStepError('');
      setPaymentMethodId(id);
    },
    notes,
    setNotes,
    submitOrder,
    isSubmitting,

    // Confirmación
    order,
    orderFolio: order ? formatOrderFolio(order.orderNumber) : '',
    placedSummary,
  };
};

// Campos obligatorios de la dirección que faltan (etiquetas en minúsculas).
const missingAddressFields = (address) =>
  SHIPPING_ADDRESS_FIELDS.filter((f) => f.required && !String(address?.[f.name] || '').trim()).map((f) =>
    f.label.toLowerCase()
  );

// Cuenta en el paso "Tus datos" sin sesión: iniciar sesión, crear cuenta o
// comprar como invitado (default). Iniciar sesión deja la sesión abierta y el
// paso cambia solo a la vista con cuenta. Crear cuenta no inicia sesión
// (falta verificar el correo): se continúa como invitado con los mismos
// datos, y el pedido aparece en "Mis pedidos" al verificar, porque el backend
// liga los pedidos por correo. `onRegistered` es useCheckout().prefillContact.
export const useCheckoutAccount = ({ onRegistered }) => {
  const [mode, setMode] = useState('guest'); // 'guest' | 'login' | 'register'
  const [registeredEmail, setRegisteredEmail] = useState('');

  const login = useLoginForm();

  const register = useRegisterForm({
    onSuccess: (_data, form) => {
      onRegistered({ customerName: form.name, customerEmail: form.email, customerPhone: form.phone });
      setRegisteredEmail(form.email);
      setMode('guest');
    },
  });

  return { mode, setMode, login, register, registeredEmail };
};
