import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { WEEK_DAYS } from "../utils/schedule";
import Alert from "./Alert";

// Especialistas de la agenda (módulo "appointments",
// packages/core-api/modules/appointments.js). Solo la administración del
// negocio las da de alta y edita.

// "Lun 10:00–19:00 · Mar …" en una línea corta.
const weekSummary = (weeklyHours = []) => {
  const days = WEEK_DAYS.filter(({ day }) => weeklyHours.some((s) => s.day === day));
  if (!days.length) return "Sin horario";
  return days.map(({ day, label }) => `${label.slice(0, 3)} ${weeklyHours.filter((s) => s.day === day).map((s) => `${s.open}–${s.close}`).join(", ")}`).join(" · ");
};

const SpecialistList = () => {
  const navigate = useNavigate();
  const [specialists, setSpecialists] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/appointments/specialists`, { headers: getAuthHeaders() });
      setSpecialists(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar las especialistas.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar esta especialista? Se borran también sus bloqueos de horario.")) return;
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/appointments/specialists/${id}`, { headers: getAuthHeaders() });
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar la especialista.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Especialistas</h3>
        <button type="button" onClick={() => navigate("/admin/specialists/new")} style={{ width: "auto" }}>
          Nueva especialista
        </button>
      </div>
      <p>
        Quién atiende, qué servicios hace y en qué horario. Si la ligas a una cuenta de colaboradora, al entrar al panel solo verá su
        propia agenda.
      </p>

      {error ? <Alert type="error">{error}</Alert> : null}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Especialista</th>
              <th>Servicios</th>
              <th>Horario</th>
              <th>Cuenta</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && specialists.length === 0 ? (
              <tr>
                <td colSpan={7}>Sin especialistas registradas.</td>
              </tr>
            ) : null}
            {specialists.map((s) => (
              <tr key={s._id}>
                <td>
                  {s.photoUrl ? (
                    <img src={`${baseUrl}/${s.photoUrl}`} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: "50%" }} />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{ display: "inline-block", width: 40, height: 40, borderRadius: "50%", background: s.color }}
                    />
                  )}
                </td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
                    {s.name}
                  </span>
                </td>
                <td>
                  {(s.services || []).length ? (
                    <small>{s.services.map((sv) => sv.name).join(", ")}</small>
                  ) : (
                    <span className="badge badge-yellow">Sin servicios</span>
                  )}
                </td>
                <td style={{ minWidth: 220 }}>
                  <small>{weekSummary(s.weeklyHours)}</small>
                </td>
                <td>{s.user ? <small>{s.user.name}<br />{s.user.email}</small> : "—"}</td>
                <td>
                  <span className={`badge badge-${s.isActive === false ? "red" : "green"}`}>{s.isActive === false ? "Inactiva" : "Activa"}</span>
                </td>
                <td style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" onClick={() => navigate(`/admin/specialists/${s._id}/edit`)}>
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

export default SpecialistList;
