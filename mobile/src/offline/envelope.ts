// JSON envelope helpers that mirror the server's Next route handlers EXACTLY.
//
// Every src/app/api/** handler answers `NextResponse.json({ success, data })` on
// success, `{ success:false, error }` on failure, and a delete/patch with
// `{ success:true, message }`. The offline bridge reproduces those shapes and
// status codes so page.tsx's readEnvelope() cannot tell the difference.

export type EnvelopeBody<T = unknown> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; code?: string };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function respond(status: number, body: EnvelopeBody): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** 200 `{ success:true, data }`. */
export function ok<T>(data: T, status = 200): Response {
  return respond(status, { success: true, data });
}

/** 200 `{ success:true, message }` — used by the delete / PATCH routes. */
export function okMessage(message: string, status = 200): Response {
  return respond(status, { success: true, message });
}

/** `{ success:false, error }` with the route's real status code. */
export function fail(error: string, status: number, code?: string): Response {
  return respond(status, { success: false, error, ...(code ? { code } : {}) });
}

/**
 * Structured 501 for an endpoint the bridge does not serve locally. Never a
 * silent-empty body: the caller sees an explicit, machine-readable failure.
 */
export function notImplemented(route: string): Response {
  return respond(501, {
    success: false,
    error: `Offline bridge has no handler for ${route}`,
    code: 'NOT_IMPLEMENTED',
  });
}
