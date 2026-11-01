import { NextRequest, NextResponse } from 'next/server';

// OAuth return-to-app handoff page (Android App Link target).
//
// The Google callback 302s here with a single-use code. Two outcomes:
//  * Verified app link (assetlinks.json matches the installed APK's signing
//    cert): Android hands this URL straight to MainActivity, which reloads the
//    bundled shell with ?auth_code= — the browser never renders this page.
//  * Verification missing (app installed before this file was deployed, or a
//    non-Android device): the page renders in the browser with a tap-to-open
//    button, because Chrome blocks custom-scheme launches without a gesture.
// The code stays single-use and short-lived either way.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = process.env.APP_ORIGIN
    || `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3070'}`;

  const code = searchParams.get('code');
  const token = searchParams.get('token');
  const param = code
    ? `code=${encodeURIComponent(code)}`
    : token
      ? `token=${encodeURIComponent(token)}`
      : null;

  if (!param) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const appUrl = `carbook://login?${param}`;

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
    .logo {
      width: 72px;
      height: 72px;
      margin: 0 auto 16px;
      display: block;
      border-radius: 18px;
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
    <img class="logo" src="/logo.png" alt="CarBook">
    <h2>تم تسجيل الدخول بنجاح!</h2>
    <p>اضغط الزر أدناه للعودة إلى تطبيق CarBook وإكمال المزامنة.</p>
    <a id="openApp" class="btn" href="${appUrl}">العودة للتطبيق الآن</a>
    <div class="subtext">إذا لم يفتح التطبيق، تأكد من تثبيت آخر إصدار من الـ APK.</div>
  </div>
  <script>
    // Best effort only: Chrome ignores custom-scheme launches without a user
    // gesture, which is exactly why the button above is the guaranteed path.
    window.location.replace(${JSON.stringify(appUrl)});
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
