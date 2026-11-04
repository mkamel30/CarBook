import { NextRequest, NextResponse } from 'next/server';
import { extractReceiptFromImage } from '@/services/ai';
import { resolveAiConfig } from '@/services/aiOrchestrator';
import { StorageRepository } from '@/persistence/repository';
import { authErrorResponse, requireUser } from '@/services/authz';
import { aiRateGuard } from '@/services/rateLimit';
import { mobilePreflight, withMobileCors } from '@/services/mobileCors';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB, far above any camera photo
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif)$/;

async function POSTHandler(req: NextRequest) {
  try {
    // Same abuse throttle as every /api/ai/* route (10/min per user per endpoint).
    const limited = await aiRateGuard(req, 'extract');
    if (limited) return limited;

    const user = requireUser(req);

    const body = await req.json();
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
    const rawImage = typeof body?.image === 'string' ? body.image : '';

    if (!rawImage) {
      return NextResponse.json({ success: false, error: 'image is required' }, { status: 400 });
    }
    if (!ALLOWED_MIME.test(mimeType)) {
      return NextResponse.json(
        { success: false, error: 'mimeType must be image/jpeg, image/png, image/webp, image/heic or image/heif' },
        { status: 400 },
      );
    }

    // Strip an optional data: URL prefix, then reject oversized or non-base64
    // payloads BEFORE any provider key leaves the process.
    const base64 = rawImage.replace(/^data:[^;]*;base64,/, '');
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const byteLen = Math.floor((base64.length * 3) / 4) - padding;
    if (byteLen > MAX_IMAGE_BYTES) {
      return NextResponse.json({ success: false, error: 'image too large (max 10 MB)' }, { status: 413 });
    }
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) {
      return NextResponse.json({ success: false, error: 'image must be base64-encoded' }, { status: 400 });
    }

    const repo = new StorageRepository();
    const config = await resolveAiConfig(repo, user.id);
    if (!config.hasKey || !config.apiKey) {
      return NextResponse.json({ success: false, error: 'No AI provider configured' }, { status: 503 });
    }

    const data = await extractReceiptFromImage(base64, mimeType, config, fetch);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export const POST = withMobileCors(POSTHandler);
export const OPTIONS = mobilePreflight;
