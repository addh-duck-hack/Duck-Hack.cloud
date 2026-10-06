import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigTabs from "./StoreConfigTabs";
import PhoneInput from "./PhoneInput";
import Alert from "./Alert";

// Pestaña "Contacto y horario": ubicación del negocio (mapa y "Cómo llegar"),
// horario de atención por día (hasta dos turnos), días festivos y botón de
// WhatsApp con mensaje prellenado. Ver StoreConfig.location / businessHours /
// holidays / whatsappButton en packages/core-api/modules/storeConfig.js. El
// horario lo reutilizará el módulo de Citas como horario general.

// Lunes primero, como se lee en México; `day` sigue la convención de JS
// (0 = domingo) igual que el backend.
const DAYS = [
  { day: 1, label: "Lunes" },
  { day: 2, label: "Martes" },
  { day: 3, label: "Miércoles" },
  { day: 4, label: "Jueves" },
  { day: 5, label: "Viernes" },
  { day: 6, label: "Sábado" },
  { day: 0, label: "Domingo" },
];
const MAX_SHIFTS_PER_DAY = 2;
const newShift = () => ({ open: "10:00", close: "19:00" });

const emptyLocation = { address: "", lat: "", lng: "", mapsUrl: "" };
const emptyWhatsapp = {
  enabled: false,
  phone: "",
  defaultMessage: "Hola, tengo una pregunta.",
  itemMessage: "Hola, me interesa: {item}",
};

// businessHours del API → { [day]: { open: bool, shifts: [{open, close}] } }.
// Un día sin renglones se toma como cerrado.
const hoursToForm = (rows = []) =>
  Object.fromEntries(
    DAYS.map(({ day }) => {
      const shifts = rows.filter((r) => r.day === day && !r.closed).map((r) => ({ open: r.open, close: r.close }));
      return [day, { open: shifts.length > 0, shifts: shifts.length ? shifts : [newShift()] }];
    })
  );

const formToHours = (form) =>
  DAYS.flatMap(({ day }) =>
    form[day]?.open ? form[day].shifts.map((s) => ({ day, open: s.open, close: s.close })) : [{ day, closed: true }]
  );

const StoreConfigContact = () => {
  const [location, setLocation] = useState(emptyLocation);
  const [hours, setHours] = useState(hoursToForm());
  const [holidays, setHolidays] = useState([]);
  const [whatsapp, setWhatsapp] = useState(emptyWhatsapp);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const applyConfig = (data) => {
    setLocation({
      address: data?.location?.address || "",
      lat: data?.location?.lat != null ? String(data.location.lat) : "",
      lng: data?.location?.lng != null ? String(data.location.lng) : "",
      mapsUrl: data?.location?.mapsUrl || "",
    });
    setHours(hoursToForm(data?.businessHours || []));
    setHolidays((data?.holidays || []).map((h) => ({ date: h.date, label: h.label || "" })));
    setWhatsapp({ ...emptyWhatsapp, ...(data?.whatsappButton || {}) });
  };

  // Al entrar, sin aviso; con "Recargar" (acción de la persona), sí.
  const loadConfig = async ({ announce = false } = {}) => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      applyConfig(response.data);
      if (announce) setMessage("Se recargó la configuración guardada.");
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

  const updateDay = (day, patch) => setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  const updateShift = (day, index, patch) =>
    updateDay(day, { shifts: hours[day].shifts.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const copyMondayToWeekdays = () =>
    setHours((prev) => ({ ...prev, ...Object.fromEntries([2, 3, 4, 5].map((d) => [d, { ...prev[1], shifts: prev[1].shifts.map((s) => ({ ...s })) }])) }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(
        `${baseUrl}/api/store-config`,
        {
          location: {
            address: location.address,
            lat: location.lat === "" ? null : Number(location.lat),
            lng: location.lng === "" ? null : Number(location.lng),
            mapsUrl: location.mapsUrl,
          },
          businessHours: formToHours(hours),
          holidays: holidays.filter((h) => h.date),
          whatsappButton: whatsapp,
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

  const smallButton = { width: "auto", padding: "0.35rem 0.6rem", margin: 0 };
  const waPreview = whatsapp.itemMessage.replace("{item}", "Uñas acrílicas");

  return (
    <section style={{ maxWidth: 1300 }}>
      <StoreConfigTabs />
      <h3>Contacto y horario</h3>
      <p>Lo que la tienda muestra en Contacto y ubicación, y el botón de WhatsApp.</p>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Ubicación</h4>
        <label>
          Dirección
          <input
            type="text"
            value={location.address}
            maxLength={400}
            placeholder="Calle, número, colonia, ciudad"
            onChange={(e) => setLocation((prev) => ({ ...prev, address: e.target.value }))}
          />
        </label>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "0.75rem" }}>
          <label>
            Latitud (opcional)
            <input type="number" step="any" min="-90" max="90" value={location.lat} onChange={(e) => setLocation((prev) => ({ ...prev, lat: e.target.value }))} />
          </label>
          <label>
            Longitud (opcional)
            <input type="number" step="any" min="-180" max="180" value={location.lng} onChange={(e) => setLocation((prev) => ({ ...prev, lng: e.target.value }))} />
          </label>
          <label>
            Enlace de Google Maps ("Cómo llegar")
            <input
              type="url"
              value={location.mapsUrl}
              maxLength={500}
              placeholder="https://maps.app.goo.gl/..."
              onChange={(e) => setLocation((prev) => ({ ...prev, mapsUrl: e.target.value }))}
            />
          </label>
        </div>

        <h4 style={{ marginTop: "2rem" }}>Horario de atención</h4>
        <p style={{ marginTop: 0 }}>Hasta dos turnos por día (por ejemplo, para cerrar a comer). Un día sin marcar se muestra como cerrado.</p>
        {DAYS.map(({ day, label }) => (
          <div key={day} className="form-row form-row--with-action" style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "start", marginBottom: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.6rem" }}>
              <input type="checkbox" checked={hours[day].open} onChange={(e) => updateDay(day, { open: e.target.checked })} style={{ width: "auto" }} />
              {label}
            </label>
            <div>
              {hours[day].open ? (
                hours[day].shifts.map((shift, index) => (
                  <div key={index} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
                    <input
                      type="time"
                      aria-label={`${label}: abre`}
                      value={shift.open}
                      onChange={(e) => updateShift(day, index, { open: e.target.value })}
                      required
                      style={{ width: "auto", marginBottom: 0 }}
                    />
                    <span>a</span>
                    <input
                      type="time"
                      aria-label={`${label}: cierra`}
                      value={shift.close}
                      onChange={(e) => updateShift(day, index, { close: e.target.value })}
                      required
                      style={{ width: "auto", marginBottom: 0 }}
                    />
                    {index > 0 ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={smallButton}
                        aria-label="Quitar turno"
                        onClick={() => updateDay(day, { shifts: hours[day].shifts.filter((_, i) => i !== index) })}
                      >
                        <i className="fas fa-trash" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <span style={{ display: "inline-block", marginTop: "0.6rem", opacity: 0.7 }}>Cerrado</span>
              )}
            </div>
            {hours[day].open && hours[day].shifts.length < MAX_SHIFTS_PER_DAY ? (
              <button
                type="button"
                className="btn-secondary"
                style={{ ...smallButton, marginTop: "0.3rem" }}
                onClick={() => updateDay(day, { shifts: [...hours[day].shifts, { open: "16:00", close: "20:00" }] })}
              >
                <i className="fas fa-plus" aria-hidden="true" /> Turno
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={copyMondayToWeekdays}>
          Copiar el horario del lunes a martes–viernes
        </button>

        <h4 style={{ marginTop: "2rem" }}>Días festivos o cerrado</h4>
        {holidays.map((holiday, index) => (
          <div key={index} className="form-row form-row--with-action" style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr) auto", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
            <input
              type="date"
              aria-label="Fecha"
              value={holiday.date}
              onChange={(e) => setHolidays((prev) => prev.map((h, i) => (i === index ? { ...h, date: e.target.value } : h)))}
              required
              style={{ marginBottom: 0 }}
            />
            <input
              type="text"
              aria-label="Motivo"
              placeholder="Motivo (opcional, ej. Navidad)"
              maxLength={80}
              value={holiday.label}
              onChange={(e) => setHolidays((prev) => prev.map((h, i) => (i === index ? { ...h, label: e.target.value } : h)))}
              style={{ marginBottom: 0 }}
            />
            <button type="button" className="btn-secondary" style={smallButton} aria-label="Quitar fecha" onClick={() => setHolidays((prev) => prev.filter((_, i) => i !== index))}>
              <i className="fas fa-trash" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => setHolidays((prev) => [...prev, { date: "", label: "" }])}>
          <i className="fas fa-plus" aria-hidden="true" /> Agregar fecha
        </button>

        <h4 style={{ marginTop: "2rem" }}>Botón de WhatsApp</h4>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={whatsapp.enabled}
            onChange={(e) => setWhatsapp((prev) => ({ ...prev, enabled: e.target.checked }))}
            style={{ width: "auto" }}
          />
          Mostrar el botón de WhatsApp en la tienda
        </label>
        <label>
          Número de WhatsApp (10 dígitos)
          {/* Se guarda con el país (52…) para los enlaces wa.me; aquí se
              captura y se muestra a 10 dígitos. */}
          <PhoneInput
            name="whatsappPhone"
            prefix="+52"
            value={whatsapp.phone}
            onChange={(e) => setWhatsapp((prev) => ({ ...prev, phone: e.target.value }))}
            required={whatsapp.enabled}
          />
        </label>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Mensaje del botón flotante
            <input
              type="text"
              value={whatsapp.defaultMessage}
              maxLength={300}
              onChange={(e) => setWhatsapp((prev) => ({ ...prev, defaultMessage: e.target.value }))}
            />
          </label>
          <label>
            Mensaje de los botones "Agendar" / "Preguntar"
            <input
              type="text"
              value={whatsapp.itemMessage}
              maxLength={300}
              onChange={(e) => setWhatsapp((prev) => ({ ...prev, itemMessage: e.target.value }))}
            />
            <small>{"{item}"} se cambia por el servicio o producto. Ej.: "{waPreview}"</small>
          </label>
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
            {isLoading ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={() => loadConfig({ announce: true })} disabled={isLoading} className="btn-secondary" style={{ width: "auto" }}>
            Recargar
          </button>
        </div>
      </form>
    </section>
  );
};

export default StoreConfigContact;
