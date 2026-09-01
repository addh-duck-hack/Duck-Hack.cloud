const auth = require("./modules/auth");
const mail = require("./modules/mail");
const uploads = require("./modules/uploads");
const storeConfig = require("./modules/storeConfig");
const products = require("./modules/products");
const inventory = require("./modules/inventory");
const orders = require("./modules/orders");

// Cada app's backend (ver backend/server.js) monta los módulos de esta
// lista. Agrega uno nuevo requiriéndolo aquí y añadiéndolo al arreglo — nada
// más debería tener que cambiar para que se recoja.
// Orden: auth primero (registra "User", y es la fuente de verifyToken/
// authorizeRoles/ROLES que arma el ctx de todos los demás); products antes
// que inventory/orders porque ambos referencian "Product" por nombre de
// modelo (no por import directo, ver lib/moduleHelpers.js#getOrCreateModel)
// — no es estrictamente necesario ya que todos los módulos se montan de
// forma síncrona antes de que el server empiece a aceptar requests, pero
// mantiene el orden legible.
const modules = [auth, mail, uploads, storeConfig, products, inventory, orders];

module.exports = {
  modules,
  // Extensión al contrato de módulo: además de {name, registerRoutes,
  // models} (lo que consume el loop de montaje), el módulo `auth` expone
  // capacidades que el resto de backend/ (y el ctx de los demás módulos)
  // necesita directamente — ver packages/core-api/modules/auth.js y su
  // README.md, sección "ctx contract".
  auth: auth.auth,
};
