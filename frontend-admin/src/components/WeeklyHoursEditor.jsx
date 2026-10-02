import React from "react";
import { WEEK_DAYS } from "../utils/schedule";

// Horario semanal por turnos: [{ day, open, close }] (day 0 = domingo). Un
// día sin turnos es descanso. Se usa en el formulario de especialistas; lo
// que realmente se agenda es el cruce con el horario del negocio.
const WeeklyHoursEditor = ({ value, onChange }) => {
  const shiftsOf = (day) => value.map((s, index) => ({ ...s, index })).filter((s) => s.day === day);

  const update = (index, field, fieldValue) => onChange(value.map((s, i) => (i === index ? { ...s, [field]: fieldValue } : s)));
  const remove = (index) => onChange(value.filter((_, i) => i !== index));
  const add = (day) => {
    const last = shiftsOf(day).at(-1);
    onChange([...value, last ? { day, open: last.close, close: last.close < "20:00" ? "20:00" : "23:59" } : { day, open: "10:00", close: "19:00" }]);
  };

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {WEEK_DAYS.map(({ day, label }) => {
        const shifts = shiftsOf(day);
        return (
          <div key={day} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "0.75rem", alignItems: "center" }}>
            <strong style={{ fontSize: "0.9rem" }}>{label}</strong>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
              {shifts.length === 0 ? <span style={{ opacity: 0.7 }}>Descanso</span> : null}
              {shifts.map((s) => (
                <span key={s.index} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <input
                    type="time"
                    value={s.open}
                    onChange={(e) => update(s.index, "open", e.target.value)}
                    aria-label={`${label}: inicio del turno`}
                    style={{ width: "auto" }}
                    required
                  />
                  –
                  <input
                    type="time"
                    value={s.close}
                    onChange={(e) => update(s.index, "close", e.target.value)}
                    aria-label={`${label}: fin del turno`}
                    style={{ width: "auto" }}
                    required
                  />
                  <button type="button" className="btn-secondary" onClick={() => remove(s.index)} aria-label={`Quitar turno del ${label.toLowerCase()}`} style={{ width: "auto" }}>
                    ✕
                  </button>
                </span>
              ))}
              {shifts.length < 4 ? (
                <button type="button" className="btn-secondary" onClick={() => add(day)} style={{ width: "auto" }}>
                  + Turno
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default WeeklyHoursEditor;
