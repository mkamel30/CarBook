// Offline fetch-bridge configuration.
//
// In Route 1 (device is primary source of truth) the UI's `fetch('/api/...')`
// is answered locally from WatermelonDB. Only the endpoints that genuinely need
// the network — auth (login) and AI — are forwarded to the server. This module
// carries that single piece of configuration so both the app and the node-env
// tests can inject their own base URL.

/** Origin the auth/AI passthrough targets. Empty string = same-origin fallback. */
export const SERVER_BASE_URL: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_CARBOOK_SERVER_URL ?? '';
