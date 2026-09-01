const pingModule = require("./modules/ping");

// Each app's backend (see backend/server.js) mounts modules from this list.
// Add a new module by requiring it here and appending it — no other app
// should need to change to pick it up.
const modules = [pingModule];

module.exports = { modules };
