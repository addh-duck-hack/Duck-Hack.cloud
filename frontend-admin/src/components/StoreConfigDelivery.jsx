import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigListEditor from "./StoreConfigListEditor";
import StoreConfigTabs from "./StoreConfigTabs";

// Pestaña "Entrega y pago": lo que el cliente puede elegir en el checkout de
// la tienda (pasos "Entrega" y "Pago"). Ver
// packages/core-api/lib/checkoutOptions.js y lib/shipping.js.

const PICKUP_POINT_FIELDS = [
  { name: "name", label: "Nombre", type: "text", required: true, maxLength: 120, placeholder: "Finca Tacita" },
  { name: "schedule", label: "Horario", type: "text", maxLength: 200, placeholder: "Lun a sáb, 9:00 a 18:00" },
  { name: "address", label: "Dirección", type: "textarea", maxLength: 400, fullWidth: true },
  { name: "instructions", label: "Indicaciones para recoger", type: "textarea", maxLength: 500, fullWidth: true },
  { name: "lat", label: "Latitud (opcional)", type: "number", step: "any", min: -90, max: 90, placeholder: "20.2764" },
  { name: "lng", label: "Longitud (opcional)", type: "number", step: "any", min: -180, max: 180, placeholder: "-97.9577" },
  { name: "isActive", label: "Activo", type: "boolean" },
];

// `type` decide cómo se cobra; una pasarela de pago se agregaría aquí como
// otra opción cuando exista en el backend (PAYMENT_METHOD_TYPES).
const PAYMENT_METHOD_TYPE_OPTIONS = [
  { value: "manual", label: "Manual (instrucciones propias)" },
  { value: "spei", label: "Transferencia SPEI (usa los datos de \"Pagos y ventas\")" },
];

const PAYMENT_METHOD_FIELDS = [
  { name: "label", label: "Nombre", type: "text", required: true, maxLength: 80, placeholder: "Pago en efectivo al recoger" },
  { name: "type", label: "Tipo", type: "select", options: PAYMENT_METHOD_TYPE_OPTIONS },
  { name: "description", label: "Descripción corta (se ve al elegirlo)", type: "text", maxLength: 200, fullWidth: true },
  {
    name: "instructions",
    label: "Instrucciones (se muestran al confirmar y en el correo del pedido)",
    type: "textarea",
    maxLength: 1000,
    fullWidth: true,
  },
  { name: "forShipping", label: "Disponible con envío a domicilio", type: "boolean" },
  { name: "forPickup", label: "Disponible al recoger en punto de venta", type: "boolean" },
  { name: "isActive", label: "Activo", type: "boolean" },
];

const emptyPickupPoint = () => ({ name: "", schedule: "", address: "", instructions: "", lat: null, lng: null, isActive: true });

const emptyPaymentMethod = () => ({
  label: "",
  type: "manual",
  description: "",
  instructions: "",
  forShipping: true,
  forPickup: true,
  isActive: true,
});

const initialShipping = { enabled: false, cost: "", freeFrom: "" };

const StoreConfigDelivery = () => {
  const [homeDeliveryEnabled, setHomeDeliveryEnabled] = useState(true);
  const [shipping, setShipping] = useState(initialShipping);
  const [pickupPoints, setPickupPoints] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const applyConfig = (data) => {
    setHomeDeliveryEnabled(data?.homeDeliveryEnabled !== false);
    setShipping({
      enabled: Boolean(data?.shipping?.enabled),
      cost: data?.shipping?.cost != null ? String(data.shipping.cost) : "",
      freeFrom: data?.shipping?.freeFrom ? String(data.shipping.freeFrom) : "",
    });
    setPickupPoints(data?.pickupPoints || []);
    setPaymentMethods(data?.paymentMethods || []);
  };

  const loadConfig = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      applyConfig(response.data);
      setMessage("Configuración cargada.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar la configuración.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShippingChange = (event) => {
    const { name, value, type, checked } = event.target;
    setShipping((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const hasActivePickupPoint = pickupPoints.some((p) => p.isActive !== false);
  const noDeliveryOption = !homeDeliveryEnabled && !hasActivePickupPoint;
  const noPaymentMethod = paymentMethods.length > 0 && !paymentMethods.some((m) => m.isActive !== false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(
        `${baseUrl}/api/store-config`,
        {
          homeDeliveryEnabled,
          shipping: {
            enabled: shipping.enabled,
            cost: shipping.cost === "" ? null : Number(shipping.cost),
            freeFrom: shipping.freeFrom === "" ? null : Number(shipping.freeFrom),
          },
          pickupPoints,
          paymentMethods,
        },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      applyConfig(response.data?.storeConfig);
      setMessage(response.data?.message || "Configuración guardada.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar la configuración.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 1300 }}>
      <StoreConfigTabs />
      <h3>Entrega y pago</h3>
      <p>Opciones que el cliente elige al finalizar su compra en la tienda: cómo recibe su pedido y cómo lo paga.</p>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}
      {noDeliveryOption ? (
        <div className="auth-error">
          No hay ninguna forma de entrega disponible: activa el envío a domicilio o agrega un punto de venta activo.
        </div>
      ) : null}
      {noPaymentMethod ? (
        <div className="auth-error">Todos los métodos de pago están inactivos: los clientes no podrán comprar.</div>
      ) : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Envío a domicilio</h4>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={homeDeliveryEnabled}
            onChange={(e) => setHomeDeliveryEnabled(e.target.checked)}
            style={{ width: "auto" }}
          />
          Ofrecer envío a domicilio
        </label>

        {homeDeliveryEnabled ? (
          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                name="enabled"
                checked={shipping.enabled}
                onChange={handleShippingChange}
                style={{ width: "auto" }}
              />
              El envío tiene costo
            </label>
            {shipping.enabled ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
                  <label>
                    Costo de envío (MXN)
                    <input
                      type="number"
                      name="cost"
                      value={shipping.cost}
                      onChange={handleShippingChange}
                      min={1}
                      step="0.01"
                      inputMode="decimal"
                      required
                      placeholder="Ej. 99"
                    />
                  </label>
                  <label>
                    Envío gratis a partir de (MXN)
                    <input
                      type="number"
                      name="freeFrom"
                      value={shipping.freeFrom}
                      onChange={handleShippingChange}
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      placeholder="Sin envío gratis"
                    />
                  </label>
                </div>
                <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                  El mínimo se compara con el subtotal de productos (ya con descuentos). Déjalo vacío si el envío
                  nunca es gratis.
                </p>
              </>
            ) : (
              <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>El envío a domicilio es gratis en todos los pedidos.</p>
            )}
          </div>
        ) : null}

        <h4 style={{ marginTop: "2rem" }}>Puntos de venta (recoger en tienda)</h4>
        <p>
          Lugares donde el cliente puede recoger su pedido, sin costo de envío. La latitud y la longitud son
          opcionales; sirven para mostrar los puntos en un mapa.
        </p>
        <StoreConfigListEditor
          items={pickupPoints}
          onChange={setPickupPoints}
          itemLabel={(item) => item.name}
          fields={PICKUP_POINT_FIELDS}
          createEmptyItem={emptyPickupPoint}
          addButtonLabel="+ Agregar punto de venta"
        />

        <h4 style={{ marginTop: "2rem" }}>Métodos de pago</h4>
        <p>
          Cómo puede pagar el cliente. La tienda confirma cada pago a mano desde Pedidos.
          {paymentMethods.length === 0
            ? " Mientras no agregues ninguno, la tienda ofrece Transferencia / SPEI y, al recoger, Pago al recoger."
            : ""}
        </p>
        <StoreConfigListEditor
          items={paymentMethods}
          onChange={setPaymentMethods}
          itemLabel={(item) => (item.isActive === false ? `${item.label} (inactivo)` : item.label)}
          fields={PAYMENT_METHOD_FIELDS}
          createEmptyItem={emptyPaymentMethod}
          addButtonLabel="+ Agregar método de pago"
        />

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
            {isLoading ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={loadConfig} disabled={isLoading} className="btn-secondary" style={{ width: "auto" }}>
            Recargar
          </button>
        </div>
      </form>
    </section>
  );
};

export default StoreConfigDelivery;
