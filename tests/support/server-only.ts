// `server-only` throws on import outside a React Server Component, which the
// Node test environment is not. Aliased in vitest.config.ts so the production
// guard on server modules stays in place.
export {};
