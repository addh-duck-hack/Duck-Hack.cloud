import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import Alert from "./Alert";

// Catálogo de servicios (módulo "services" de los permisos,
// packages/core-api/modules/services.js). Una cita puede llevar varios
// servicios: su duración es la suma y el tiempo entre citas, el mayor.

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export const formatDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const depositLabel = (deposit) => {
  if (!deposit || deposit.type === "none" || !deposit.value) return "—";
  return deposit.type === "percent" ? `${deposit.value}%` : formatMxn(deposit.value);
};

const ServiceList = () => {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadServices = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/services`, { headers: getAuthHeaders() });
      setServices(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los servicios.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este servicio?")) return;
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/services/${id}`, { headers: getAuthHeaders() });
      await loadServices();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el servicio.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Servicios</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/service-categories")} style={{ width: "auto" }}>
            Categorías
          </button>
          <button type="button" onClick={() => navigate("/admin/services/new")} style={{ width: "auto" }}>
            Nuevo servicio
          </button>
        </div>
      </div>
      <p>Lo que ofrece el negocio, con su duración y precio. Un servicio que ya está en citas no se borra: desactívalo.</p>

      {error ? <Alert type="error">{error}</Alert> : null}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Servicio</th>
              <th>Categoría</th>
              <th>Duración</th>
              <th>Precio</th>
              <th>Anticipo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && services.length === 0 ? (
              <tr>
                <td colSpan={8}>Sin servicios registrados.</td>
              </tr>
            ) : null}
            {services.map((s) => (
              <tr key={s._id}>
                <td>
                  {s.image ? (
                    <img src={`${baseUrl}/${s.image}`} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {s.name}
                  {s.bookableOnline === false ? (
                    <small style={{ display: "block", opacity: 0.75 }}>No se agenda en línea</small>
                  ) : null}
                </td>
                <td>{s.category?.name || "—"}</td>
                <td>
                  {formatDuration(s.durationMin)}
                  {s.bufferMin ? <small style={{ display: "block", opacity: 0.75 }}>+{s.bufferMin} min entre citas</small> : null}
                </td>
                <td>
                  {s.priceFrom ? "Desde " : ""}
                  {formatMxn(s.price)}
                </td>
                <td>{depositLabel(s.deposit)}</td>
                <td>
                  <span className={`badge badge-${s.isActive === false ? "red" : "green"}`}>{s.isActive === false ? "Inactivo" : "Activo"}</span>
                </td>
                <td style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" onClick={() => navigate(`/admin/services/${s._id}/edit`)}>
                    Editar
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => handleDelete(s._id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default ServiceList;
