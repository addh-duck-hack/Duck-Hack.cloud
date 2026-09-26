import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { MEXICAN_BANKS } from "../utils/mexicanBanks";
import StoreConfigTabs from "./StoreConfigTabs";

const initialState = {
  accountHolderName: "",
  clabe: "",
  phone: "",
  bank: "",
  maxUnitsPerProduct: "",
  shippingEnabled: false,
  shippingCost: "",
  freeShippingFrom: "",
};

const StoreConfigPayments = () => {
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const mapApiToForm = (data) => ({
    accountHolderName: data?.speiPayment?.accountHolderName || "",
    clabe: data?.speiPayment?.clabe || "",
    phone: data?.speiPayment?.phone || "",
    bank: data?.speiPayment?.bank || "",
    // null/0 = sin límite; se muestra vacío para que se lea así.
    maxUnitsPerProduct: data?.maxUnitsPerProduct ? String(data.maxUnitsPerProduct) : "",
    shippingEnabled: Boolean(data?.shipping?.enabled),
    shippingCost: data?.shipping?.cost != null ? String(data.shipping.cost) : "",
    freeShippingFrom: data?.shipping?.freeFrom ? String(data.shipping.freeFrom) : "",
  });

  const loadConfig = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      setForm(mapApiToForm(response.data));
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

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(
        `${baseUrl}/api/store-config`,
        {
          speiPayment: {
            accountHolderName: form.accountHolderName,
            clabe: form.clabe,
            phone: form.phone,
            bank: form.bank,
          },
          maxUnitsPerProduct: form.maxUnitsPerProduct === "" ? null : Number(form.maxUnitsPerProduct),
          shipping: {
            enabled: form.shippingEnabled,
            cost: form.shippingCost === "" ? null : Number(form.shippingCost),
            freeFrom: form.freeShippingFrom === "" ? null : Number(form.freeShippingFrom),
          },
        },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setForm(mapApiToForm(response.data?.storeConfig));
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
      <h3>Pagos (SPEI)</h3>
      <p>
        Cuenta a la que los clientes deben transferir por SPEI para pagar sus pedidos. Estos datos no se
        muestran públicamente en la tienda — se usarán para incluirlos en el correo de confirmación de
        pedido que recibe el comprador.
      </p>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Nombre completo
            <input
              type="text"
              name="accountHolderName"
              value={form.accountHolderName}
              onChange={handleChange}
              maxLength={160}
            />
          </label>
          <label>
            Banco receptor
            <select name="bank" value={form.bank} onChange={handleChange}>
              <option value="">Selecciona un banco</option>
              {MEXICAN_BANKS.map((bankName) => (
                <option key={bankName} value={bankName}>
                  {bankName}
                </option>
              ))}
            </select>
          </label>
          <label>
            CLABE interbancaria
            <input
              type="text"
              name="clabe"
              value={form.clabe}
              onChange={handleChange}
              maxLength={18}
              inputMode="numeric"
              placeholder="18 dígitos"
            />
          </label>
          <label>
            Número de celular
            <input type="tel" name="phone" value={form.phone} onChange={handleChange} maxLength={20} />
          </label>
        </div>

        <h3 style={{ marginTop: "2rem" }}>Límite de compra</h3>
        <p>
          Máximo de piezas de un mismo producto que un cliente puede llevar en un pedido de la tienda.
          Para cantidades mayores, la tienda le ofrece contactarlos como cliente mayorista. Déjalo vacío
          o en 0 para no poner límite (solo se limita a las existencias del inventario).
        </p>
        <label style={{ maxWidth: 320 }}>
          Piezas máximas por producto
          <input
            type="number"
            name="maxUnitsPerProduct"
            value={form.maxUnitsPerProduct}
            onChange={handleChange}
            min={0}
            max={9999}
            step={1}
            inputMode="numeric"
            placeholder="Sin límite"
          />
        </label>

        <h3 style={{ marginTop: "2rem" }}>Envío</h3>
        <p>
          Si los productos cobran envío, el costo se suma al pedido en la tienda (en la canasta, el total, el
          correo y el comprobante PDF). Los pedidos que se recogen en tienda nunca pagan envío.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            name="shippingEnabled"
            checked={form.shippingEnabled}
            onChange={handleChange}
            style={{ width: "auto" }}
          />
          Los productos tienen costo de envío
        </label>
        {form.shippingEnabled ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
            <label>
              Costo de envío (MXN)
              <input
                type="number"
                name="shippingCost"
                value={form.shippingCost}
                onChange={handleChange}
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
                name="freeShippingFrom"
                value={form.freeShippingFrom}
                onChange={handleChange}
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="Sin envío gratis"
              />
            </label>
          </div>
        ) : null}
        {form.shippingEnabled ? (
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            El mínimo se compara con el subtotal de productos (ya con descuentos). Déjalo vacío si el envío
            nunca es gratis.
          </p>
        ) : null}

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

export default StoreConfigPayments;
