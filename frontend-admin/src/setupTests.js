// Matchers de jest-dom para Vitest (expect(el).toBeInTheDocument(), etc.)
import '@testing-library/jest-dom/vitest';

// jsdom bajo Node 22+ no siempre expone `localStorage` como global (el código
// de la app lo usa sin prefijo `window.`). Shim en memoria solo para tests.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}
