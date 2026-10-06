// src/ui/SlotPicker.jsx — día y hora libres de la agenda
// (GET /api/appointments/availability). Primero pide qué días tienen lugar
// (from/to) y, al elegir uno, sus horarios. Lo usan Agendar y Reprogramar.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { dayLabel, errorText, isoDay } from '../utils/format';
import { Loading, Notice } from './bits';

const SlotPicker = ({ serviceIds, specialist = 'any', maxDaysAhead = 30, timezone, value, onChange, onQuote }) => {
  const [days, setDays] = useState([]);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [loadingDays, setLoadingDays] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState('');
  const services = serviceIds.join(',');
  const base = `services=${encodeURIComponent(services)}&specialist=${encodeURIComponent(specialist || 'any')}`;

  useEffect(() => {
    setDays([]);
    setDate('');
    setSlots([]);
    onChange(null);
    if (!services) return undefined;
    let cancelled = false;
    setLoadingDays(true);
    setError('');
    const span = Math.min(Math.max(Number(maxDaysAhead) || 30, 1), 60);
    apiFetch(`/api/appointments/availability?${base}&from=${isoDay(0, timezone)}&to=${isoDay(span, timezone)}`)
      .then((data) => {
        if (cancelled) return;
        setDays((data.days || []).filter((d) => d.available));
        onQuote?.({ durationMin: data.durationMin, total: data.total, depositAmount: data.depositAmount || 0 });
      })
      .catch((err) => !cancelled && setError(errorText(err)))
      .finally(() => !cancelled && setLoadingDays(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, maxDaysAhead, timezone]);

  const pickDate = async (d) => {
    setDate(d);
    setSlots([]);
    onChange(null);
    setLoadingSlots(true);
    setError('');
    try {
      const data = await apiFetch(`/api/appointments/availability?${base}&date=${d}`);
      setSlots(data.slots || []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoadingSlots(false);
    }
  };

  if (!services) return <p className="muted">Primero elige al menos un servicio.</p>;

  return (
    <div className="slot-picker">
      {loadingDays ? <Loading text="Buscando días con lugar…" /> : null}
      <Notice type="error">{error}</Notice>
      {!loadingDays && !error && !days.length ? <p className="muted">No hay horarios libres en los próximos días. Prueba con otra especialista o escríbenos.</p> : null}
      <div className="day-strip">
        {days.map((d) => {
          const l = dayLabel(d.date);
          return (
            <button type="button" key={d.date} className={`day ${date === d.date ? 'is-active' : ''}`} onClick={() => pickDate(d.date)}>
              <small>{l.weekday}</small>
              <strong>{l.day}</strong>
              <small>{l.month}</small>
            </button>
          );
        })}
      </div>
      {loadingSlots ? <Loading text="Cargando horarios…" /> : null}
      {date && !loadingSlots && !slots.length && !error ? <p className="muted">Ese día ya no tiene horarios libres.</p> : null}
      {slots.length ? (
        <div className="slot-grid">
          {slots.map((s) => (
            <button type="button" key={s.start} className={`slot ${value?.start === s.start ? 'is-active' : ''}`} onClick={() => onChange(s)}>
              {s.time}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default SlotPicker;
