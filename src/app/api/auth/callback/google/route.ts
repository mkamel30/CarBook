import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { getGoogleRedirectUri, signSessionToken } from '@/services/auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const origin = process.env.APP_ORIGIN
    || `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3070'}`;

  if (error || !code) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error || 'missing_code')}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?auth_error=server_credentials_missing`);
  }

  try {
    const redirectUri = getGoogleRedirectUri(req);

    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Google token exchange error:', errBody);
      return NextResponse.redirect(`${origin}/?auth_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userinfoRes.ok) {
      return NextResponse.redirect(`${origin}/?auth_error=userinfo_failed`);
    }

    const profile = await userinfoRes.json();
    // profile contains: sub (id), email, name, picture

    // 3. Persist or update user in SQLite & auto-claim legacy records
    const repo = new StorageRepository();
    const user = await repo.findOrCreateUser({
      id: profile.sub,
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      picture: profile.picture || null,
    });

    // 4. Generate JWT session cookie
    const sessionToken = signSessionToken(user, 30);

    // Check if authentication was initiated from mobile app or Android device
    let isApp = false;
    const stateParam = searchParams.get('state');
    if (stateParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(stateParam));
        if (parsed.source === 'app') isApp = true;
      } catch {}
    }
    if (!isApp && req.headers.get('user-agent')?.includes('Android')) {
      isApp = true;
    }

    if (isApp) {
      const appUrl = `carbook://login?token=${encodeURIComponent(sessionToken)}`;
      const safeUserName = (user.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>تسجيل الدخول | CarBook</title>
  <style>
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 16px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 20px;
      padding: 32px 24px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
      display: inline-block;
    }
    h2 {
      margin: 0 0 8px 0;
      font-size: 20px;
      color: #f1f5f9;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.5;
      margin: 0 0 24px 0;
    }
    .btn {
      display: block;
      background: #f59e0b;
      color: #090d16;
      font-weight: bold;
      padding: 14px 20px;
      border-radius: 12px;
      text-decoration: none;
      font-size: 15px;
      transition: background 0.2s;
    }
    .btn:active {
      background: #d97706;
    }
    .subtext {
      margin-top: 16px;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🚗</div>
    <h2>تم تسجيل الدخول بنجاح!</h2>
    <p>مرحباً بك ${safeUserName}. جاري إعادتك لتطبيق CarBook...</p>
    <a id="openApp" class="btn" href="${appUrl}">العودة للتطبيق الآن</a>
    <div class="subtext">إذا لم يتم فتح التطبيق تلقائياً، اضغط على الزر أعلاه.</div>
  </div>
  <script>
    const appUrl = ${JSON.stringify(appUrl)};
    window.location.replace(appUrl);
    setTimeout(function() {
      window.location.href = appUrl;
    }, 400);
  </script>
</body>
</html>`;

      const response = new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });

      response.cookies.set('carbook_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });

      return response;
    }

    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set('carbook_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    console.error('OAuth callback exception:', err);
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(err.message)}`);
  }
}
