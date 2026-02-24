const API_BASE_URL = process.env.REACT_APP_HOST_SERVICES_URL;
const TENANT_HEADER_NAME = process.env.REACT_APP_TENANT_HEADER_NAME || "X-Tenant-Slug";

export const getTenantSlug = () => {
  const explicitSlug = (process.env.REACT_APP_STORE_SLUG || "").trim();
  if (explicitSlug) return explicitSlug;

  const hostname = (window?.location?.hostname || "").trim().toLowerCase();
  if (!hostname || hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return "";
  }

  const [subdomain] = hostname.split(".");
  return subdomain && subdomain !== "www" ? subdomain : "";
};

export const apiFetch = async (path, options = {}) => {
  if (!API_BASE_URL) {
    throw new Error("REACT_APP_HOST_SERVICES_URL no está configurado.");
  }

  const tenantSlug = getTenantSlug();
  const headers = {
    ...(options.headers || {}),
  };

  if (tenantSlug) {
    headers[TENANT_HEADER_NAME] = tenantSlug;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Error de solicitud";
    throw new Error(message);
  }

  return payload;
};
