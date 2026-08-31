// Sugerencias de clases FontAwesome para los campos de tipo "icon" del store
// config (pasos de "Qué puedes hacer con nosotros", servicios). No es una
// lista cerrada — el campo sigue siendo texto libre (cualquier clase válida
// de las que ya carga el proyecto, ver frontend-user/public/index.html), esto
// solo evita que el admin tenga que adivinar o memorizar la sintaxis exacta.
export const FA_ICON_SUGGESTIONS = [
  { value: "fas fa-server", label: "Servidor" },
  { value: "fas fa-cloud", label: "Nube" },
  { value: "fas fa-laptop-code", label: "Sitio web" },
  { value: "fas fa-mobile-alt", label: "App móvil" },
  { value: "fas fa-palette", label: "Diseño / marca" },
  { value: "fas fa-shield-alt", label: "Seguridad" },
  { value: "fas fa-rocket", label: "Lanzamiento" },
  { value: "fas fa-database", label: "Base de datos" },
  { value: "fas fa-cogs", label: "Configuración" },
  { value: "fas fa-headset", label: "Soporte" },
  { value: "fas fa-chart-line", label: "Estadísticas" },
  { value: "fas fa-lock", label: "Candado" },
  { value: "fas fa-globe", label: "Dominio / global" },
  { value: "fas fa-bolt", label: "Rendimiento" },
  { value: "fas fa-check-circle", label: "Check (genérico)" },
  { value: "fas fa-wrench", label: "Mantenimiento" },
  { value: "fas fa-envelope", label: "Correo" },
  { value: "fas fa-shopping-cart", label: "Tienda / eCommerce" },
];

// id del <datalist> compartido — un solo elemento en la página basta, todos
// los inputs de tipo "icon" lo referencian por igual vía el atributo `list`.
export const FA_ICON_DATALIST_ID = "fa-icon-suggestions";
