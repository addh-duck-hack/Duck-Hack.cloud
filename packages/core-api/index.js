const auth = require("./modules/auth");
const mail = require("./modules/mail");
const storeConfig = require("./modules/storeConfig");
const categories = require("./modules/categories");
const services = require("./modules/services");
const appointments = require("./modules/appointments");
const products = require("./modules/products");
const inventory = require("./modules/inventory");
const orders = require("./modules/orders");
const coupons = require("./modules/coupons");
const reviews = require("./modules/reviews");
const media = require("./modules/media");
const appHome = require("./modules/appHome");
const permissions = require("./modules/permissions");
const permissionsLib = require("./lib/permissions");

// Cada app's backend (ver backend/server.js) monta los módulos de esta
// lista. Agrega uno nuevo requiriéndolo aquí y añadiéndolo al arreglo — nada
// más debería tener que cambiar para que se recoja.
// services después de categories (Service.category referencia "Category").
// Orden: auth primero (registra "User", y es la fuente de verifyToken/
// authorizeRoles/ROLES que arma el ctx de todos los demás); categories antes
// que products (Product.category referencia "Category"); products antes
// que inventory/orders porque ambos referencian "Product" por nombre de
// modelo (no por import directo, ver lib/moduleHelpers.js#getOrCreateModel)
// — no es estrictamente necesario ya que todos los módulos se montan de
// forma síncrona antes de que el server empiece a aceptar requests, pero
// mantiene el orden legible.
const modules = [auth, mail, storeConfig, categories, services, appointments, products, inventory, orders, coupons, reviews, media, appHome, permissions];

module.exports = {
  modules,
  // Extensión al contrato de módulo: además de {name, registerRoutes,
  // models} (lo que consume el loop de montaje), el módulo `auth` expone
  // capacidades que el resto de backend/ (y el ctx de los demás módulos)
  // necesita directamente — ver packages/core-api/modules/auth.js y su
  // README.md, sección "ctx contract".
  auth: auth.auth,
  // Permisos por tienda (módulos contratados + por rol): los routers de
  // backend/ que no viven aquí (AgencyClient/Accounting/Invoices) arman sus
  // middlewares con permissions.createModuleAuthorizer({ mongooseConnection,
  // sendError }) — ver lib/permissions.js.
  permissions: {
    createModuleAuthorizer: permissionsLib.createModuleAuthorizer,
    PERMISSION_MODULES: permissionsLib.PERMISSION_MODULES,
  },
};
