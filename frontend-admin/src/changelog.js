// Novedades del panel ("Lo nuevo en tu panel", tarjeta del Inicio).
//
// Viajan con cada build del admin: una tienda ve exactamente lo que trae la
// versión que tiene desplegada (le llegan con su PR main → release-*). Todo
// cambio que el cliente note, al llegar a main, agrega aquí su entrada — la
// más reciente PRIMERO. El `id` no se cambia nunca (lo leído se guarda por
// id en User.dashboardPreferences.changelogSeen).
//
// `modules`: solo la ven quienes tienen alguno de esos módulos (claves de
// permisos, utils/permissions.js); sin `modules`, la ven todos.
// `kind`: "new" (función nueva) | "improvement" | "fix".
const CHANGELOG = [
  {
    id: "2026-10-06-app-banners-promociones",
    date: "2026-10-06",
    kind: "new",
    modules: ["appConfig"],
    title: "Banners de promociones en la app",
    body: "En Configurar App → Home ya puedes agregar la sección \"Banners de promociones\": muestra en la app los mismos banners del Inicio que ves en tu sitio web, y se actualiza sola cuando los editas en Banners.",
  },
  {
    id: "2026-10-06-mayoreo",
    date: "2026-10-06",
    kind: "new",
    modules: ["wholesale"],
    title: "Mayoreo",
    body: "En Negocio → Mayoreo registras a los negocios que te compran por volumen, con sus días de crédito y descuento, sus ventas (al entregarlas se descuenta el inventario), los abonos que te van pagando y quién te debe y desde cuándo.",
  },
  {
    id: "2026-10-06-contabilidad-tienda",
    date: "2026-10-06",
    kind: "new",
    modules: ["storeAccounting"],
    title: "Contabilidad de la tienda",
    body: "En Negocio → Contabilidad ves tus ingresos y gastos por mes: las ventas, tarjetas de regalo, anticipos y abonos entran solos, y tú registras renta, sueldos y demás gastos. También puedes exportarlo a Excel.",
  },
  {
    id: "2026-10-06-compras-proveedores",
    date: "2026-10-06",
    kind: "new",
    modules: ["storeAccounting"],
    title: "Compras a proveedores",
    body: "Registra a tus proveedores y lo que les compras: al recibir una compra sube tu inventario y al pagarla queda como gasto, así sabes también cuánto les debes.",
  },
  {
    id: "2026-10-06-historial-inventario",
    date: "2026-10-06",
    kind: "improvement",
    modules: ["inventory"],
    title: "Historial de inventario",
    body: "En Inventario → Historial ves cada entrada y salida de producto (pedidos, ventas, compras y ajustes a mano) con quién la hizo; al corregir una cantidad puedes anotar el motivo.",
  },
  {
    id: "2026-10-06-descripcion-larga",
    date: "2026-10-06",
    kind: "improvement",
    modules: ["products"],
    title: "Descripciones de producto más largas",
    body: "La descripción de un producto ahora admite hasta 20,000 caracteres (antes 2,000), con un contador mientras escribes.",
  },
  {
    id: "2026-10-06-avisos-en-ventana",
    date: "2026-10-06",
    kind: "improvement",
    title: "Avisos que no se pierden",
    body: "Los errores y confirmaciones al guardar ahora aparecen en una ventana al centro de la pantalla, y los errores dicen exactamente qué corregir (por ejemplo, si un texto es demasiado largo).",
  },
  {
    id: "2026-10-06-vista-cita",
    date: "2026-10-06",
    kind: "improvement",
    modules: ["appointments"],
    title: "Cada cita con su propia página",
    body: "Al abrir una cita desde la agenda, el listado o el Inicio ves todo su detalle en una página: puedes agregar fotos y videos (con la autorización de la clienta) y ver su calificación y sus reseñas anteriores.",
  },
  {
    id: "2026-10-06-listado-citas",
    date: "2026-10-06",
    kind: "new",
    modules: ["appointments"],
    title: "Listado de citas",
    body: "En Servicios → Citas ves todas las citas de hoy, las próximas y el historial, con búsqueda por clienta, teléfono o servicio y filtros por estado y especialista.",
  },
  {
    id: "2026-10-06-inicio",
    date: "2026-10-06",
    kind: "new",
    title: "Nuevo Inicio del panel",
    body: "Al entrar verás un resumen de tu negocio: pendientes, ventas, citas de hoy e inventario. Con \"Opciones de pantalla\" eliges qué tarjetas ver y en qué orden.",
  },
  {
    id: "2026-10-06-tarjetas-regalo",
    date: "2026-10-06",
    kind: "new",
    modules: ["giftCards"],
    title: "Tarjetas de regalo",
    body: "Vende tarjetas en tu sitio (pago por transferencia) o en mostrador. Tus clientes las usan en partes: en la tienda en línea, en el local o para pagar el anticipo de una cita.",
  },
  {
    id: "2026-10-06-reportes",
    date: "2026-10-06",
    kind: "new",
    modules: ["reports"],
    title: "Reportes",
    body: "Ventas, ticket promedio, productos más vendidos, clientes nuevos y recurrentes, y citas por especialista y servicio, con exportación a Excel (CSV).",
  },
  {
    id: "2026-10-05-anticipo-citas",
    date: "2026-10-05",
    kind: "new",
    modules: ["appointments"],
    title: "Anticipo por transferencia en citas",
    body: "Los servicios con anticipo apartan el horario hasta que la clienta sube su comprobante; lo apruebas desde la agenda. Si no paga a tiempo, la cita se libera sola.",
  },
  {
    id: "2026-10-05-configurar-tienda",
    date: "2026-10-05",
    kind: "improvement",
    modules: ["storeConfig"],
    title: "Configurar tienda más clara",
    body: "Textos pensados para cualquier tipo de negocio y planes o paquetes con características libres (ej. Sesiones: 4).",
  },
  {
    id: "2026-10-04-banners",
    date: "2026-10-04",
    kind: "new",
    modules: ["promoBanner"],
    title: "Banners de promociones",
    body: "Campañas con imagen, fechas y un botón a una categoría, un cupón o cualquier enlace. Se ocultan solas si el cupón vence.",
  },
  {
    id: "2026-10-04-lista-deseos",
    date: "2026-10-04",
    kind: "new",
    modules: ["wishlist"],
    title: "Aviso de favoritos disponibles",
    body: "Cuando un producto agotado vuelve a tener existencias, avisamos por correo a quienes lo tienen en favoritos.",
  },
  {
    id: "2026-10-04-resena-post-cita",
    date: "2026-10-04",
    kind: "new",
    modules: ["reviews"],
    title: "Calificación después de la cita",
    body: "Tus clientas reciben un correo para calificar su cita; las que apruebes puedes publicarlas como testimonio en tu sitio.",
  },
  {
    id: "2026-10-04-lealtad",
    date: "2026-10-04",
    kind: "new",
    modules: ["loyalty"],
    title: "Programa de lealtad",
    body: "Puntos por cada compra pagada que tus clientes usan como descuento, y tarjeta de sellos por cita completada con un premio al llegar a la meta.",
  },
  {
    id: "2026-10-03-carrito-abandonado",
    date: "2026-10-03",
    kind: "new",
    modules: ["abandonedCart"],
    title: "Recordatorio de carrito abandonado",
    body: "Si un cliente deja productos en su carrito, le mandamos un recordatorio por correo, opcionalmente con un cupón de un solo uso.",
  },
  {
    id: "2026-10-03-recordatorios",
    date: "2026-10-03",
    kind: "new",
    modules: ["reminders"],
    title: "Recordatorios de cita",
    body: "Un correo antes de cada cita con los botones \"Confirmo mi asistencia\" y \"Reprogramar o cancelar\".",
  },
];

export const CHANGELOG_KINDS = {
  new: "Nuevo",
  improvement: "Mejora",
  fix: "Corrección",
};

// Las novedades que este usuario puede ver.
export const visibleChangelog = (can) => CHANGELOG.filter((entry) => !entry.modules?.length || entry.modules.some((key) => can(key)));

// ¿Cuáles no ha leído? Las que están antes (más nuevas) de la última que
// marcó como leída. Si nunca leyó ninguna, todas; si la que leyó ya no está en
// la lista visible, las de fecha posterior (el id empieza con la fecha).
export const unreadIds = (entries, seenId) => {
  if (!seenId) return new Set(entries.map((e) => e.id));
  const index = entries.findIndex((entry) => entry.id === seenId);
  const unread = index >= 0 ? entries.slice(0, index) : entries.filter((e) => e.date > seenId.slice(0, 10));
  return new Set(unread.map((e) => e.id));
};

export default CHANGELOG;
