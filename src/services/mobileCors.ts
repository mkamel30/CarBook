import { NextRequest, NextResponse } from 'next/server';

// Scoped CORS for the BUNDLED Capacitor app only.
//
// The shipped APK serves its UI from Capacitor's local `https://localhost`
// scheme, so every call it makes to this server is cross-origin and needs
// explicit CORS headers (the session cookie can never travel that way anyway —
// the app authenticates with `Authorization: Bearer …`, see mobile authBridge).
//
// Deliberately narrow, per-route and additive (no global middleware):
//  * exact-origin allowlist: only the Capacitor local scheme, never `*`;
//  * NO Access-Control-Allow-Credentials: cookies are never accepted
//    cross-origin, so a forged page cannot ride a browser session;
//  * only the headers the app actually sends are allowed (Authorization for
//    the bearer, Content-Type for JSON bodies);
//  * browsers (web app) are same-origin and send no cross-origin Origin, so
//    their responses are byte-identical to before this helper.
const MOBILE_ORIGINS = new Set(['https://localhost']);

export function mobileOriginFor(req: NextRequest): string | null {
  const origin = req.headers.get('origin');
  return origin && MOBILE_ORIGINS.has(origin) ? origin : null;
}

function applyCors(res: NextResponse, origin: string, preflight: boolean): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.append('Vary', 'Origin');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (preflight) res.headers.set('Access-Control-Max-Age', '600');
  return res;
}

export type MobileCorsHandler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

/**
 * What `withMobileCors` hands back. Spelled as a distinct type because the
 * wrapper IS async: a route exported through it always resolves to a
 * `Promise<NextResponse>`, never the handler's sync|promise union. Without this
 * the wrapped exports (e.g. POST /api/ai/lookup) fail `tsc` wherever a caller
 * or test types the handler as returning `Promise<Response>`.
 */
export type WrappedCorsHandler = (req: NextRequest) => Promise<NextResponse>;

/** Wrap a route handler: answer OPTIONS preflights and tag real responses. */
export function withMobileCors(handler: MobileCorsHandler): WrappedCorsHandler {
  return async (req: NextRequest): Promise<NextResponse> => {
    const origin = mobileOriginFor(req);
    if (req.method === 'OPTIONS') {
      if (!origin) return new NextResponse(null, { status: 403 });
      return applyCors(new NextResponse(null, { status: 204 }), origin, true);
    }
    const res = await handler(req);
    return origin ? applyCors(res, origin, false) : res;
  };
}

/**
 * Next.js App Router answers an OPTIONS request itself — a bare 204 with an
 * `Allow` header and NO CORS headers — whenever a route does not export an
 * OPTIONS handler, so the preflight never reaches `withMobileCors` and the
 * WebView's CORS check fails with an opaque network error. Every mobile-facing
 * route must export this next to its wrapped method handlers.
 */
export const mobilePreflight: WrappedCorsHandler = withMobileCors(
  async () => new NextResponse(null, { status: 204 }),
);
