import { tStatic } from '@/i18n/staticTranslate';

/**
 * Every `src/app/api/**` handler answers `{ success:true, data }` on success and
 * `{ success:false, error }` on failure (see mobile/src/offline/envelope.ts, which
 * mirrors the same shapes for the offline bridge).
 */
export type Envelope = { success: true; data?: any } | { success: false; error: string };

/**
 * Read an API response as an envelope. A reverse proxy answering a 502 with HTML
 * would otherwise make `res.json()` throw inside the handler, leaving the modal
 * open with no message even though the write may already have landed.
 */
export async function readEnvelope(res: Response): Promise<Envelope> {
  const httpFailure = tStatic('err_http_status', { status: res.status });
  if (res.status === 401) return { success: false, error: tStatic('err_session_expired') };

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || !('success' in body)) {
    return { success: false, error: httpFailure };
  }
  if (body.success) return { success: true, data: body.data };
  return { success: false, error: typeof body.error === 'string' && body.error ? body.error : httpFailure };
}
