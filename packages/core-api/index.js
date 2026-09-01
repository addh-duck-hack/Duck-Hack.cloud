const mail = require("./modules/mail");
const uploads = require("./modules/uploads");
const products = require("./modules/products");
const inventory = require("./modules/inventory");
const orders = require("./modules/orders");

// Cada app's backend (ver backend/server.js) monta los módulos de esta
// lista. Agrega uno nuevo requiriéndolo aquí y añadiéndolo al arreglo — nada
// más debería tener que cambiar para que se recoja.
// Orden: products antes que inventory/orders porque ambos referencian
// "Product" por nombre de modelo (no por import directo, ver
// lib/moduleHelpers.js#getOrCreateModel) — no es estrictamente necesario ya
// que todos los módulos se montan de forma síncrona antes de que el server
// empiece a aceptar requests, pero mantiene el orden legible.
const modules = [mail, uploads, products, inventory, orders];

module.exports = { modules };
