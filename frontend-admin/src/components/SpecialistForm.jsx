import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import MediaField from "./MediaField";
import WeeklyHoursEditor from "./WeeklyHoursEditor";
import { formatDuration } from "./ServiceList";
import Alert from "./Alert";

// Alta y edición de una especialista: datos, servicios que hace, horario
// semanal y cuenta ligada (opcional).

const initialState = {
  name: "",
  photoUrl: "",
  bio: "",
  color: "#4abdfc",
  user: "",
  services: [],
  weeklyHours: [],
  sortOrder: "0",
  isActive: true,
};

const SpecialistForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialState);
  const [services, setServices] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    axios
      .get(`${baseUrl}/api/services`, { headers: getAuthHeaders() })
      .then((response) => setServices(response.data?.items || []))
      .catch(() => setServices([]));
    axios
      .get(`${baseUrl}/api/appointments/specialists/linkable-users`, { headers: getAuthHeaders() })
      .then((response) => setUsers(response.data?.items || []))
      .catch(() => setUsers([]));
    if (!isEditing) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const { data: s } = await axios.get(`${baseUrl}/api/appointments/specialists/${id}`, { headers: getAuthHeaders() });
        setForm({
          name: s.name || "",
          photoUrl: s.photoUrl || "",
          bio: s.bio || "",
          color: s.color || "#4abdfc",
          user: s.user?._id || s.user || "",
          services: (s.services || []).map((sv) => sv._id || sv),
          weeklyHours: (s.weeklyHours || []).map(({ day, open, close }) => ({ day, open, close })),
          sortOrder: String(s.sortOrder ?? 0),
          isActive: s.isActive !== false,
        });
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar la especialista.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Servicios agrupados por categoría para los checkboxes.
  const servicesByCategory = useMemo(() => {
    const groups = new Map();
    for (const service of services) {
      const key = service.category?.name || "Sin categoría";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(service);
    }
    return [...groups.entries()];
  }, [services]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const toggleService = (serviceId) =>
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(serviceId) ? prev.services.filter((x) => x !== serviceId) : [...prev.services, serviceId],
    }));

  // Copia el horario general de "Configurar tienda" como punto de partida.
  const copyBusinessHours = async () => {
    setNotice("");
    try {
      const { data } = await axios.get(`${baseUrl}/api/store-config/public`);
      const hours = (data?.businessHours || []).filter((h) => !h.closed && h.open && h.close).map(({ day, open, close }) => ({ day, open, close }));
      if (!hours.length) {
        setNotice('La tienda aún no tiene horario en "Configurar tienda".');
        return;
      }
      setForm((prev) => ({ ...prev, weeklyHours: hours }));
    } catch {
      setNotice("No fue posible leer el horario del negocio.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        photoUrl: form.photoUrl,
        bio: form.bio,
        color: form.color,
        user: form.user || null,
        services: form.services,
        weeklyHours: form.weeklyHours,
        sortOrder: Number(form.sortOrder || 0),
        isActive: form.isActive,
      };
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      if (isEditing) await axios.put(`${baseUrl}/api/appointments/specialists/${id}`, payload, { headers });
      else await axios.post(`${baseUrl}/api/appointments/specialists`, payload, { headers });
      navigate("/admin/specialists");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar la especialista.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>Cargando...</p>;

  return (
    <section style={{ maxWidth: 1300 }}>
      <h3>{isEditing ? "Editar especialista" : "Nueva especialista"}</h3>

      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.75rem" }}>
          <label>
            Nombre
            <input type="text" name="name" value={form.name} onChange={handleChange} maxLength={100} required />
          </label>
          <label>
            Color en la agenda
            <input type="color" name="color" value={form.color} onChange={handleChange} style={{ height: 42, padding: 4 }} />
          </label>
          <label>
            Orden
            <input type="number" name="sortOrder" min="0" step="1" value={form.sortOrder} onChange={handleChange} />
          </label>
        </div>

        <label>
          Cuenta del panel (opcional)
          <select name="user" value={form.user} onChange={handleChange}>
            <option value="">Sin cuenta (la administración maneja su agenda)</option>
            {users.map((u) => (
              <option key={u._id} value={u._id} disabled={Boolean(u.linkedTo) && String(u.linkedTo._id) !== String(id)}>
                {u.name} · {u.email}
                {u.role === "store_admin" ? " (administradora)" : ""}
                {u.linkedTo && String(u.linkedTo._id) !== String(id) ? ` — ya es ${u.linkedTo.name}` : ""}
              </option>
            ))}
          </select>
          <small>Una colaboradora ligada solo ve y mueve su propia agenda.</small>
        </label>

        <label>
          Presentación (opcional)
          <textarea name="bio" value={form.bio} onChange={handleChange} rows={3} maxLength={2000} />
        </label>

        <MediaField label="Foto (opcional)" value={form.photoUrl} onChange={(photoUrl) => setForm((prev) => ({ ...prev, photoUrl }))} />

        <fieldset style={{ marginTop: "1rem" }}>
          <legend>Servicios que hace</legend>
          {services.length === 0 ? <p>Primero da de alta los servicios en "Servicios".</p> : null}
          {servicesByCategory.map(([category, items]) => (
            <div key={category} style={{ marginBottom: "0.5rem" }}>
              <small style={{ opacity: 0.75 }}>{category}</small>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 1rem" }}>
                {items.map((sv) => (
                  <label key={sv._id} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                    <input type="checkbox" checked={form.services.includes(sv._id)} onChange={() => toggleService(sv._id)} style={{ width: "auto" }} />
                    {sv.name} <small style={{ opacity: 0.7 }}>({formatDuration(sv.durationMin)})</small>
                    {sv.isActive === false ? <small style={{ opacity: 0.7 }}> · inactivo</small> : null}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset style={{ marginTop: "1rem" }}>
          <legend>Horario semanal</legend>
          <p style={{ marginTop: 0 }}>
            Se agenda solo donde este horario cruza con el del negocio (y sin festivos ni bloqueos).{" "}
            <button type="button" className="btn-secondary" onClick={copyBusinessHours} style={{ width: "auto" }}>
              Copiar horario del negocio
            </button>
          </p>
          {notice ? <p style={{ opacity: 0.8 }}>{notice}</p> : null}
          <WeeklyHoursEditor value={form.weeklyHours} onChange={(weeklyHours) => setForm((prev) => ({ ...prev, weeklyHours }))} />
        </fieldset>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto" }} />
          Especialista activa (se puede agendar con ella)
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/specialists")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default SpecialistForm;
