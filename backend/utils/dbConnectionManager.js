const mongoose = require("mongoose");

const DEFAULT_MAX_POOL = Number.parseInt(process.env.TENANT_DB_MAX_POOL || "10", 10);
const DEFAULT_MIN_POOL = Number.parseInt(process.env.TENANT_DB_MIN_POOL || "0", 10);
const DEFAULT_SERVER_SELECTION_TIMEOUT = Number.parseInt(
  process.env.TENANT_DB_SERVER_SELECTION_TIMEOUT_MS || "5000",
  10
);

const tenantConnections = new Map();

const connectionOptions = {
  maxPoolSize: Number.isFinite(DEFAULT_MAX_POOL) ? DEFAULT_MAX_POOL : 10,
  minPoolSize: Number.isFinite(DEFAULT_MIN_POOL) ? DEFAULT_MIN_POOL : 0,
  serverSelectionTimeoutMS: Number.isFinite(DEFAULT_SERVER_SELECTION_TIMEOUT)
    ? DEFAULT_SERVER_SELECTION_TIMEOUT
    : 5000,
  autoIndex: process.env.NODE_ENV !== "production",
};

const ensureTrailingSlash = (uri) => (uri.endsWith("/") ? uri : `${uri}/`);

const getGlobalMongoUri = () => {
  const uri = (process.env.MONGO_URL_GLOBAL || "").trim();
  if (!uri) {
    throw new Error("MONGO_URL_GLOBAL must be configured before using dbConnectionManager.");
  }
  return uri;
};

const buildTenantMongoUri = (dbName) => {
  const trimmedDbName = (dbName || "").trim();
  if (!trimmedDbName) {
    throw new Error("dbName is required to build the tenant Mongo URI.");
  }

  const globalUri = getGlobalMongoUri();
  const questionMarkIndex = globalUri.indexOf("?");
  const uriWithoutQuery = questionMarkIndex === -1 ? globalUri : globalUri.slice(0, questionMarkIndex);
  const queryString = questionMarkIndex === -1 ? "" : globalUri.slice(questionMarkIndex);

  const lastSlashIndex = uriWithoutQuery.lastIndexOf("/");
  const protocolTerminatorIndex = uriWithoutQuery.indexOf("//");
  const afterProtocolIndex = protocolTerminatorIndex === -1 ? 0 : protocolTerminatorIndex + 2;

  let base;
  if (lastSlashIndex >= afterProtocolIndex) {
    base = uriWithoutQuery.slice(0, lastSlashIndex + 1);
  } else {
    base = ensureTrailingSlash(uriWithoutQuery);
  }

  return `${ensureTrailingSlash(base)}${trimmedDbName}${queryString}`;
};

const normalizeSlug = (slug) => {
  if (!slug) {
    throw new Error("slug is required when dbName is not provided.");
  }
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_/, "")
    .replace(/_$/, "");
};

const buildDbNameFromSlug = (slug) => {
  const prefix = (process.env.TENANT_DB_PREFIX || "store_").trim();
  return `${prefix}${normalizeSlug(slug)}`.replace(/__+/g, "_");
};

const resolveDbName = ({ dbName, slug }) => {
  if (dbName && dbName.trim()) {
    return dbName.trim();
  }
  return buildDbNameFromSlug(slug);
};

const createConnectionRecord = (dbName) => {
  const uri = buildTenantMongoUri(dbName);
  const connection = mongoose.createConnection(uri, connectionOptions);
  const readyPromise = connection
    .asPromise()
    .then(() => connection)
    .catch((error) => {
      tenantConnections.delete(dbName);
      throw error;
    });

  connection.on("disconnected", () => {
    tenantConnections.delete(dbName);
  });

  const record = { connection, readyPromise };
  tenantConnections.set(dbName, record);
  return record;
};

const getTenantConnection = async (dbName) => {
  const normalizedDbName = (dbName || "").trim();
  if (!normalizedDbName) {
    throw new Error("dbName is required to obtain a tenant connection.");
  }

  const record = tenantConnections.get(normalizedDbName) || createConnectionRecord(normalizedDbName);
  await record.readyPromise;
  return record.connection;
};

const getTenantModel = async ({ dbName, slug }, modelName, schema) => {
  if (!modelName) {
    throw new Error("modelName is required when requesting a tenant model.");
  }
  if (!schema) {
    throw new Error("schema is required when requesting a tenant model.");
  }
  const resolvedDbName = resolveDbName({ dbName, slug });
  const connection = await getTenantConnection(resolvedDbName);
  if (connection.models[modelName]) {
    return connection.models[modelName];
  }
  return connection.model(modelName, schema);
};

const closeAllTenantConnections = async () => {
  const closeOperations = [];
  for (const { connection } of tenantConnections.values()) {
    closeOperations.push(
      connection.close().catch(() => {
        // Ignore close errors, most likely already closed.
      })
    );
  }
  tenantConnections.clear();
  await Promise.allSettled(closeOperations);
};

module.exports = {
  buildDbNameFromSlug,
  buildTenantMongoUri,
  closeAllTenantConnections,
  getTenantConnection,
  getTenantModel,
  resolveDbName,
};
