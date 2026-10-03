// Tareas programadas en el proceso (Fase 3 del Roadmap de cotizaciones,
// Obsidian "Fase 3 - Tareas programadas"). Una instancia de backend por
// tienda → no hace falta cola externa: un intervalo revisa cada `tickMs`
// qué tareas ya toca correr.
//
// Los módulos registran sus tareas con el contrato opcional
// `registerJobs(scheduler, ctx)` (lo llama backend/server.js) y
// `scheduler.register(name, everyMs, run)`. Reglas:
// - una tarea nunca corre dos veces a la vez (si la anterior sigue, se salta);
// - un error en una tarea se registra y no detiene a las demás;
// - no corre nada mientras Mongo no esté conectado (`isReady`).
// Variables: SCHEDULER_ENABLED (default true; "false" en pruebas o si algún
// día hubiera varias instancias de la misma tienda) y SCHEDULER_TICK_MS
// (default 60000). Solo para pruebas: SCHEDULER_JOB_INTERVAL_MS reemplaza el
// intervalo de todas las tareas (para no esperar minutos).
//
// claimEach: envía cada aviso UNA sola vez aunque el servidor se reinicie a
// medias. Antes de enviar marca el documento con un update atómico
// (`markField` = ahora, solo si seguía vacío); si el envío falla quita la
// marca y suma un intento, y deja de intentarlo al llegar a `maxAttempts`.

const DEFAULT_TICK_MS = 60 * 1000;

const createScheduler = ({
  enabled = process.env.SCHEDULER_ENABLED !== "false",
  tickMs = Number(process.env.SCHEDULER_TICK_MS) || DEFAULT_TICK_MS,
  isReady = () => true,
  logger = console,
  jobIntervalOverrideMs = Number(process.env.SCHEDULER_JOB_INTERVAL_MS) || null,
} = {}) => {
  const jobs = new Map();
  let timer = null;

  const register = (name, everyMs, run) => {
    if (jobs.has(name)) throw new Error(`La tarea "${name}" ya está registrada.`);
    if (!(everyMs > 0) || typeof run !== "function") throw new Error(`Tarea "${name}" inválida.`);
    jobs.set(name, { name, everyMs: jobIntervalOverrideMs || everyMs, run, running: false, lastRunAt: null, lastDurationMs: null, lastError: null, lastResult: null, runs: 0, failures: 0 });
  };

  const runJob = async (job, now = new Date()) => {
    if (job.running) return { skipped: "running" };
    job.running = true;
    const started = Date.now();
    try {
      job.lastResult = (await job.run({ now })) ?? null;
      job.lastError = null;
      return { ok: true, result: job.lastResult };
    } catch (error) {
      job.failures += 1;
      job.lastError = error?.message || String(error);
      logger.error(`[scheduler] La tarea "${job.name}" falló:`, job.lastError);
      return { ok: false, error: job.lastError };
    } finally {
      job.runs += 1;
      job.lastRunAt = new Date(started);
      job.lastDurationMs = Date.now() - started;
      job.running = false;
    }
  };

  // Corre las tareas que ya tocan (sin esperar entre ellas: una lenta no
  // retrasa a las demás).
  const tick = async (now = new Date()) => {
    if (!isReady()) return [];
    const due = [...jobs.values()].filter((job) => !job.running && (!job.lastRunAt || now - job.lastRunAt >= job.everyMs));
    return Promise.all(due.map((job) => runJob(job, now)));
  };

  const start = () => {
    if (!enabled || timer) return false;
    timer = setInterval(() => {
      tick().catch((error) => logger.error("[scheduler] Error en el ciclo:", error?.message));
    }, tickMs);
    // No mantiene vivo el proceso por sí solo.
    if (typeof timer.unref === "function") timer.unref();
    logger.log(`[scheduler] Activo: ${jobs.size} tarea(s), revisión cada ${Math.round(tickMs / 1000)} s.`);
    return true;
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  // Para pruebas y diagnóstico: correr una tarea ya, sin esperar su turno.
  const runNow = async (name) => {
    const job = jobs.get(name);
    if (!job) throw new Error(`No existe la tarea "${name}".`);
    return runJob(job);
  };

  const status = () => ({
    enabled,
    running: Boolean(timer),
    tickMs,
    jobs: [...jobs.values()].map(({ run, ...info }) => info),
  });

  return { register, start, stop, tick, runNow, status, get enabled() {
    return enabled;
  } };
};

// Reclama y procesa documentos uno por uno, sin repetir envíos.
//   Model, filter: candidatos (claimEach agrega markField vacío e intentos < max)
//   markField: campo fecha que marca "ya enviado" (p. ej. "reminderSentAt")
//   attemptsField: contador de intentos fallidos (p. ej. "reminderAttempts")
//   handle(doc): envía; si lanza, se libera la marca y se cuenta el intento
// → { claimed, sent, failed }
const claimEach = async ({ Model, filter, markField, attemptsField, maxAttempts = 3, sort, limit = 100, handle, now = new Date(), logger = console }) => {
  const pending = {
    ...filter,
    [markField]: null,
    ...(attemptsField ? { [attemptsField]: { $not: { $gte: maxAttempts } } } : {}),
  };
  const candidates = await Model.find(pending).sort(sort || { _id: 1 }).limit(limit).select("_id").lean();
  const result = { claimed: 0, sent: 0, failed: 0 };
  for (const { _id } of candidates) {
    // Update atómico: si otra corrida (u otro proceso) ya lo marcó, no se toca.
    const doc = await Model.findOneAndUpdate({ _id, ...pending }, { $set: { [markField]: now } }, { new: true });
    if (!doc) continue;
    result.claimed += 1;
    try {
      await handle(doc);
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      logger.error(`[scheduler] No se pudo procesar ${Model.modelName} ${_id}:`, error?.message || error);
      await Model.updateOne(
        { _id, [markField]: now },
        { $set: { [markField]: null }, ...(attemptsField ? { $inc: { [attemptsField]: 1 } } : {}) }
      );
    }
  }
  return result;
};

module.exports = { createScheduler, claimEach, DEFAULT_TICK_MS };
