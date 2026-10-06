import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import MediaField from "./MediaField";
import Alert from "./Alert";

// Alta y edición de un banner de promociones
// (packages/core-api/modules/promoBanners.js). Las fechas son días de
// calendario como en los cupones: inicio a las 00:00 y fin a las 23:59 (hora
// local). Las categorías y cupones a elegir vienen de /api/promo-banners/options
// (no hace falta tener los permisos de Productos o Cupones).

const initialState = {
  title: "",
  text: "",
  image: "",
  mobileImage: "",
  buttonLabel: "",
  targetType: "none",
  targetValue: "",
  startsAt: "",
  endsAt: "",
  placement: "home",
  sortOrder: "0",
  isActive: true,
};

const toDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromDateInput = (value, endOfDay) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return (endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d, 0, 0, 0)).toISOString();
};

const PromoBannerForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialState);
  const [options, setOptions] = useState({ categories: [], coupons: [] });
  const [targetProblem, setTargetProblem] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    (async () => {
      try {
        const [optionsRes, bannerRes] = await Promise.all([
          axios.get(`${baseUrl}/api/promo-banners/options`, { headers: getAuthHeaders() }),
          isEditing ? axios.get(`${baseUrl}/api/promo-banners/${id}`, { headers: getAuthHeaders() }) : Promise.resolve(null),
        ]);
        setOptions(optionsRes.data);
        const b = bannerRes?.data;
        if (b) {
          setForm({
            title: b.title || "",
            text: b.text || "",
            image: b.image || "",
            mobileImage: b.mobileImage || "",
            buttonLabel: b.buttonLabel || "",
            targetType: b.target?.type || "none",
            targetValue: b.target?.value || "",
            startsAt: toDateInput(b.startsAt),
            endsAt: toDateInput(b.endsAt),
            placement: b.placement || "home",
            sortOrder: String(b.sortOrder ?? 0),
            isActive: b.isActive !== false,
          });
          setTargetProblem(b.targetProblem);
        }
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar el banner.");
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "targetType" ? { targetValue: "" } : {}),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.image) {
      setError("Elige la imagen del banner.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title,
        text: form.text,
        image: form.image,
        mobileImage: form.mobileImage,
        buttonLabel: form.targetType === "none" ? "" : form.buttonLabel,
        target: { type: form.targetType, value: form.targetValue },
        startsAt: fromDateInput(form.startsAt, false),
        endsAt: fromDateInput(form.endsAt, true),
        placement: form.placement,
        sortOrder: Number(form.sortOrder || 0),
        isActive: form.isActive,
      };
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      if (isEditing) await axios.put(`${baseUrl}/api/promo-banners/${id}`, payload, { headers });
      else await axios.post(`${baseUrl}/api/promo-banners`, payload, { headers });
      navigate("/admin/promo-banners");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el banner.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>Cargando...</p>;

  // El cupón guardado puede ya no estar en las opciones (vencido): se agrega
  // para no perderlo al editar otra cosa.
  const couponOptions =
    form.targetType === "coupon" && form.targetValue && !options.coupons.some((c) => c.code === form.targetValue)
      ? [{ code: form.targetValue, label: "ya no vigente" }, ...options.coupons]
      : options.coupons;

  return (
    <section style={{ maxWidth: 1100 }}>
      <h3>{isEditing ? "Editar banner" : "Nuevo banner"}</h3>
      {targetProblem ? <div className="auth-error">Este banner no se muestra en el sitio: {targetProblem}</div> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Título
            <input type="text" name="title" value={form.title} onChange={handleChange} maxLength={120} required placeholder="Buen Fin: 20% en café de especialidad" />
          </label>
          <label>
            Texto (opcional)
            <input type="text" name="text" value={form.text} onChange={handleChange} maxLength={300} placeholder="Solo este fin de semana" />
          </label>
        </div>

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.5rem" }}>
          <MediaField label="Imagen (horizontal)" value={form.image} onChange={(image) => setForm((prev) => ({ ...prev, image }))} />
          <MediaField
            label="Imagen para celular (opcional, vertical)"
            value={form.mobileImage}
            onChange={(mobileImage) => setForm((prev) => ({ ...prev, mobileImage }))}
          />
        </div>

        <fieldset style={{ marginTop: "0.75rem" }}>
          <legend>Botón</legend>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            <label>
              Lleva a
              <select name="targetType" value={form.targetType} onChange={handleChange}>
                <option value="none">Sin botón</option>
                <option value="category">Una categoría</option>
                <option value="coupon">Un cupón</option>
                <option value="url">Un enlace</option>
              </select>
            </label>
            {form.targetType === "category" ? (
              <label>
                Categoría
                <select name="targetValue" value={form.targetValue} onChange={handleChange} required>
                  <option value="">Elige…</option>
                  {options.categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {form.targetType === "coupon" ? (
              <label>
                Cupón
                <select name="targetValue" value={form.targetValue} onChange={handleChange} required>
                  <option value="">Elige…</option>
                  {couponOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label}
                    </option>
                  ))}
                </select>
                <small>El banner deja de mostrarse solo si el cupón vence o se agota.</small>
              </label>
            ) : null}
            {form.targetType === "url" ? (
              <label>
                Enlace
                <input type="text" name="targetValue" value={form.targetValue} onChange={handleChange} required placeholder="https://… o /contacto" />
              </label>
            ) : null}
            {form.targetType !== "none" ? (
              <label>
                Texto del botón
                <input
                  type="text"
                  name="buttonLabel"
                  value={form.buttonLabel}
                  onChange={handleChange}
                  maxLength={40}
                  required
                  placeholder={form.targetType === "coupon" ? "Usar cupón" : "Ver más"}
                />
              </label>
            ) : null}
          </div>
        </fieldset>

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
          <label>
            Desde (opcional)
            <input type="date" name="startsAt" value={form.startsAt} onChange={handleChange} />
          </label>
          <label>
            Hasta (opcional)
            <input type="date" name="endsAt" value={form.endsAt} onChange={handleChange} />
          </label>
          <label>
            Dónde se muestra
            <select name="placement" value={form.placement} onChange={handleChange}>
              <option value="home">Inicio</option>
              <option value="shop">Tienda</option>
              <option value="all">Inicio y tienda</option>
            </select>
          </label>
          <label>
            Orden
            <input type="number" name="sortOrder" min="0" step="1" value={form.sortOrder} onChange={handleChange} />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto" }} />
          Banner encendido
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/promo-banners")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default PromoBannerForm;
