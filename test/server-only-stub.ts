// `server-only` throws on import outside a React Server Component, which is
// exactly what we want in production and exactly what breaks a plain Node test
// runner. Aliased to this no-op under vitest so server modules stay importable
// in tests without dropping the real guard from the shipped build.
export {};
