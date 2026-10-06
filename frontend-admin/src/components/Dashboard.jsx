import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { usePermissions } from "../hooks/usePermissions";
import { useStoreConfig } from "../hooks/useStoreConfig";
import { useDashboardPrefs } from "../hooks/useDashboardPrefs";
import { CHANGELOG_KINDS } from "../changelog";
import { ORDER_STATUS_LABELS } from "../utils/orderStatusLabels";
import { APPOINTMENT_STATUS_LABELS } from "../utils/schedule";
import { getDateStatusBadge } from "../utils/dateStatusBadge";
import SeriesBarChart from "./SeriesBarChart";
import "./Dashboard.css";

// Inicio del panel (`/admin`), gratis para todas las tiendas: lo primero que
// ve el staff al entrar. Tarjetas según los módulos que cada quien tiene
// (backend: packages/core-api/modules/dashboard.js, que solo manda lo
// permitido) y "Opciones de pantalla" para ocultarlas y ordenarlas, guardado
// por usuario (hooks/useDashboardPrefs.jsx). Las novedades salen de
// src/changelog.js.

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const formatTime = (value, tz) => new Date(value).toLocaleTimeString("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
const formatDay = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

const Empty = ({ children }) => <p className="dash-empty">{children}</p>;

// ---- Tarjetas ----
const Welcome = ({ storeName, can, onDismiss }) => {
  const links = [
    can("storeConfig") ? { to: "/admin/store-config", icon: "fa-solid fa-store", label: "Configurar tienda" } : null,
    can("products") ? { to: "/admin/products/new", icon: "fa-solid fa-plus", label: "Nuevo producto" } : null,
    can("appointments") ? { to: "/admin/appointments", icon: "fa-solid fa-calendar-days", label: "Abrir la agenda" } : null,
    can("orders") ? { to: "/admin/orders", icon: "fa-solid fa-receipt", label: "Ver pedidos" } : null,
  ].filter(Boolean);
  return (
    <div className="dash-welcome">
      <button type="button" className="dash-dismiss" onClick={onDismiss} aria-label="Descartar bienvenida">
        <i className="fa-solid fa-xmark" aria-hidden="true" /> Descartar
      </button>
      <h2>¡Bienvenido a tu panel{storeName ? ` de ${storeName}` : ""}!</h2>
      <p>Aquí ves lo más importante de tu negocio. Usa "Opciones de pantalla" para elegir qué tarjetas mostrar.</p>
      <div className="dash-quick">
        {links.map((l) => (
          <Link key={l.to} to={l.to}>
            <i className={l.icon} aria-hidden="true" /> {l.label}
          </Link>
        ))}
        {process.env.REACT_APP_STOREFRONT_URL ? (
          <a href={process.env.REACT_APP_STOREFRONT_URL} target="_blank" rel="noopener noreferrer">
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Ver sitio público
          </a>
        ) : null}
      </div>
    </div>
  );
};

const News = () => {
  const { changelog, unread, save } = useDashboardPrefs();
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? changelog : changelog.slice(0, Math.max(3, unread.size));
  if (!changelog.length) return <Empty>Sin novedades por ahora.</Empty>;
  return (
    <>
      <ul className="dash-news">
        {list.map((entry) => (
          <li key={entry.id} className={unread.has(entry.id) ? "is-unread" : ""}>
            <div className="dash-news-head">
              <strong>{entry.title}</strong>
              {unread.has(entry.id) ? <span className="badge badge-yellow">Nuevo</span> : <span className="dash-muted">{CHANGELOG_KINDS[entry.kind]}</span>}
            </div>
            <p>{entry.body}</p>
            <small className="dash-muted">{formatDay(entry.date)}</small>
          </li>
        ))}
      </ul>
      <div className="dash-actions">
        {unread.size ? (
          <button type="button" className="btn-secondary" onClick={() => save({ changelogSeen: changelog[0].id })}>
            Marcar como leído
          </button>
        ) : null}
        {changelog.length > list.length || showAll ? (
          <button type="button" className="btn-secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Ver menos" : `Ver todas (${changelog.length})`}
          </button>
        ) : null}
      </div>
    </>
  );
};

const Todo = ({ items }) =>
  items?.length ? (
    <ul className="dash-todo">
      {items.map((t) => (
        <li key={t.id}>
          <Link to={t.link}>
            <span>{t.label}</span>
            <span className="dash-count">{t.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <Empty>Nada pendiente por ahora 🎉</Empty>
  );

const AtAGlance = ({ data }) => (
  <>
    <div className="dash-stats">
      <div>
        <small>Ventas de hoy</small>
        <strong>{formatMxn(data.today.revenue)}</strong>
        <small>{data.today.orders} pagados · {data.today.allOrders} recibidos</small>
      </div>
      <div>
        <small>Ventas del mes</small>
        <strong>{formatMxn(data.month.revenue)}</strong>
        <small>{data.month.orders} pedidos · ticket {formatMxn(data.month.avgTicket)}</small>
      </div>
    </div>
    <SeriesBarChart
      points={data.week.map((p) => ({ label: formatDay(p.period), short: formatDay(p.period), value: p.revenue, detail: `${p.orders} pedidos` }))}
      format={formatMxn}
      ariaLabel="Ventas de los últimos 7 días"
    />
  </>
);

const TodayAppointments = ({ data }) => {
  if (data.notLinked) return <Empty>Tu cuenta no está ligada a una especialista; pídele a la administración que te asigne.</Empty>;
  if (!data.items.length) return <Empty>No hay citas para hoy.</Empty>;
  return (
    <ul className="dash-list">
      {data.items.map((a) => (
        <li key={a._id}>
          <span className="dash-time">{formatTime(a.start, data.timezone)}</span>
          <span className="dash-grow">
            {a.customerName}
            <small className="dash-muted"> · {a.services.join(" + ")} · {a.specialistName}</small>
          </span>
          <span className="dash-muted">{APPOINTMENT_STATUS_LABELS[a.status] || a.status}</span>
        </li>
      ))}
    </ul>
  );
};

const LatestOrders = ({ items }) =>
  items.length ? (
    <ul className="dash-list">
      {items.map((o) => (
        <li key={o._id}>
          <Link to={`/admin/orders/${o._id}`} className="dash-grow">
            #{o.orderNumber} · {o.customerName}
          </Link>
          <span>{formatMxn(o.total)}</span>
          <span className={`badge badge-${ORDER_STATUS_LABELS[o.status]?.color || "blue"}`}>{ORDER_STATUS_LABELS[o.status]?.label || o.status}</span>
        </li>
      ))}
    </ul>
  ) : (
    <Empty>Aún no hay pedidos.</Empty>
  );

const LowStock = ({ items }) =>
  items.length ? (
    <ul className="dash-list">
      {items.map((i) => (
        <li key={i._id}>
          <span className="dash-grow">{i.name}</span>
          <span className={`badge badge-${i.status === "out_of_stock" ? "red" : "yellow"}`}>{i.status === "out_of_stock" ? "Agotado" : `${i.quantity} pzas`}</span>
        </li>
      ))}
      <li>
        <Link to="/admin/inventory">Ir al inventario →</Link>
      </li>
    </ul>
  ) : (
    <Empty>Todo el inventario está bien surtido.</Empty>
  );

const Balances = ({ data }) => (
  <div className="dash-stats">
    {data.giftCards ? (
      <div>
        <small>Tarjetas de regalo por canjear</small>
        <strong>{formatMxn(data.giftCards.outstanding)}</strong>
        <small>{data.giftCards.activeCards} activas</small>
      </div>
    ) : null}
    {data.loyalty ? (
      <div>
        <small>Puntos de lealtad en circulación</small>
        <strong>{formatMxn(data.loyalty.points)}</strong>
        <small>{data.loyalty.accountsWithPoints} clientes con puntos</small>
      </div>
    ) : null}
  </div>
);

// Uso del servidor (solo módulo panel): lo esencial; el detalle sigue en /admin/server.
const Server = () => {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    axios
      .get(`${getApiBaseUrl()}/api/infra/metrics`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then(({ data }) => setMetrics(data))
      .catch((err) => setError(err.response?.data?.error?.message || "No fue posible medir el servidor."));
  }, []);
  return (
    <>
      {error ? <Empty>{error}</Empty> : null}
      {metrics ? (
        <div className="dash-stats">
          {[["CPU", metrics.cpu?.percent], ["Memoria", metrics.memory?.percent], ["Disco", metrics.disk?.percent]].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value ?? "—"}%</strong>
            </div>
          ))}
        </div>
      ) : !error ? (
        <p className="dash-muted">Midiendo…</p>
      ) : null}
      <Link to="/admin/server">Ver detalle e infraestructura →</Link>
    </>
  );
};

// Hosting de los clientes de la agencia (módulo agencyClients, en la práctica
// solo la instancia de Duck-Hack): vencidos, sin pagos y por vencer, con la
// misma regla de colores que la lista de Clientes (utils/dateStatusBadge.js).
const HostingDue = () => {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    axios
      .get(`${getApiBaseUrl()}/api/agency-clients`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then(({ data }) => setClients(data.items || []))
      .catch((err) => setError(err.response?.data?.error?.message || "No fue posible cargar los clientes."));
  }, []);
  if (error) return <Empty>{error}</Empty>;
  if (!clients) return <p className="dash-muted">Cargando…</p>;

  const due = clients
    .filter((c) => c.isActive !== false && c.hostingPlan !== "free")
    .map((c) => ({ client: c, badge: getDateStatusBadge(c.hostingPaidUntil, { emptyLabel: "Sin pagos" }) }))
    .filter(({ badge }) => badge.color !== "green")
    .sort((a, b) => new Date(a.client.hostingPaidUntil || 0) - new Date(b.client.hostingPaidUntil || 0));
  const overdue = due.filter(({ badge }) => badge.color === "red").length;

  return due.length ? (
    <>
      <div className="dash-stats">
        <div>
          <small>Vencidos o sin pagos</small>
          <strong>{overdue}</strong>
        </div>
        <div>
          <small>Por vencer</small>
          <strong>{due.length - overdue}</strong>
        </div>
      </div>
      <ul className="dash-list">
        {due.map(({ client, badge }) => (
          <li key={client._id}>
            <Link className="dash-grow" to={`/admin/agency-clients/${client._id}`}>
              {client.businessName}
            </Link>
            {client.hostingMonthlyCost ? <span className="dash-muted">{formatMxn(client.hostingMonthlyCost)}/mes</span> : null}
            <span className={`badge badge-${badge.color}`}>{badge.label}</span>
          </li>
        ))}
        <li>
          <Link to="/admin/agency-clients">Ir a Clientes →</Link>
        </li>
      </ul>
    </>
  ) : (
    <Empty>Todos los clientes están al día con su hosting.</Empty>
  );
};

// Catálogo: id (lo que se guarda en las preferencias), título, ícono, quién
// la puede ver y con qué datos se pinta. El orden es el de por default.
const WIDGETS = [
  { id: "news", title: "Lo nuevo en tu panel", icon: "fa-solid fa-bullhorn", available: () => true, render: () => <News /> },
  { id: "todo", title: "Pendientes", icon: "fa-solid fa-list-check", available: (can, w) => Boolean(w), render: (w) => <Todo items={w.todo} /> },
  { id: "hostingDue", title: "Hosting de clientes", icon: "fa-solid fa-file-invoice-dollar", available: (can) => can("agencyClients"), render: () => <HostingDue /> },
  { id: "atAGlance", title: "De un vistazo", icon: "fa-solid fa-chart-column", available: (can, w) => Boolean(w?.atAGlance), render: (w) => <AtAGlance data={w.atAGlance} /> },
  { id: "todayAppointments", title: "Citas de hoy", icon: "fa-solid fa-calendar-day", available: (can, w) => Boolean(w?.todayAppointments), render: (w) => <TodayAppointments data={w.todayAppointments} /> },
  { id: "latestOrders", title: "Últimos pedidos", icon: "fa-solid fa-receipt", available: (can, w) => Boolean(w?.latestOrders), render: (w) => <LatestOrders items={w.latestOrders} /> },
  { id: "lowStock", title: "Inventario bajo", icon: "fa-solid fa-boxes-stacked", available: (can, w) => Boolean(w?.lowStock), render: (w) => <LowStock items={w.lowStock} /> },
  { id: "balances", title: "Tarjetas y lealtad", icon: "fa-solid fa-gift", available: (can, w) => Boolean(w?.balances), render: (w) => <Balances data={w.balances} /> },
  { id: "server", title: "Servidor", icon: "fa-solid fa-server", available: (can) => can("panel"), render: () => <Server /> },
];

const Dashboard = () => {
  const { can } = usePermissions();
  const { config } = useStoreConfig();
  const { prefs, loaded, save } = useDashboardPrefs();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    axios
      .get(`${getApiBaseUrl()}/api/dashboard/summary`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then(({ data }) => setSummary(data))
      .catch((err) => setError(err.response?.data?.error?.message || "No fue posible cargar el resumen."));
  }, []);

  const widgets = summary?.widgets;
  // Tarjetas que este usuario puede ver, en su orden (las nuevas al final).
  const available = useMemo(() => {
    const list = WIDGETS.filter((w) => w.available(can, widgets));
    const order = prefs.order || [];
    return [...list].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [can, widgets, prefs.order]);
  const hidden = new Set(prefs.hidden || []);
  const shown = available.filter((w) => !hidden.has(w.id));

  const toggle = (id) => save({ hidden: hidden.has(id) ? [...hidden].filter((x) => x !== id) : [...hidden, id] });
  const move = (index, delta) => {
    const ids = available.map((w) => w.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    save({ order: ids });
  };

  return (
    <section className="dash">
      <div className="dash-top">
        <h3 style={{ margin: 0 }}>Inicio</h3>
        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => setShowOptions((v) => !v)} aria-expanded={showOptions}>
          Opciones de pantalla <i className={`fa-solid fa-caret-${showOptions ? "up" : "down"}`} aria-hidden="true" />
        </button>
      </div>

      {showOptions ? (
        <div className="dash-options">
          <p>Elige qué tarjetas ver y en qué orden. Se guarda en tu cuenta.</p>
          <ul>
            {available.map((w, i) => (
              <li key={w.id}>
                <label>
                  <input type="checkbox" checked={!hidden.has(w.id)} onChange={() => toggle(w.id)} />
                  <i className={w.icon} aria-hidden="true" /> {w.title}
                </label>
                <span>
                  <button type="button" className="btn-secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${w.title}`}>
                    ↑
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => move(i, 1)} disabled={i === available.length - 1} aria-label={`Bajar ${w.title}`}>
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="dash-actions">
            {prefs.welcomeDismissed ? (
              <button type="button" className="btn-secondary" onClick={() => save({ welcomeDismissed: false })}>
                Mostrar la bienvenida
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => save({ hidden: [], order: [] })}>
              Restablecer
            </button>
          </div>
        </div>
      ) : null}

      {loaded && !prefs.welcomeDismissed ? <Welcome storeName={config?.storeName} can={can} onDismiss={() => save({ welcomeDismissed: true })} /> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <div className="dash-grid">
        {shown.map((w) => (
          <article key={w.id} className={`dash-card dash-card--${w.id}`}>
            <h4>
              <i className={w.icon} aria-hidden="true" /> {w.title}
            </h4>
            {w.id === "news" || w.id === "server" || widgets ? w.render(widgets) : <p className="dash-muted">Cargando…</p>}
          </article>
        ))}
      </div>
      {!shown.length ? <Empty>Ocultaste todas las tarjetas. Actívalas en "Opciones de pantalla".</Empty> : null}
    </section>
  );
};

export default Dashboard;
