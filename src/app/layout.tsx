import './globals.css';
import type { Metadata, Viewport } from 'next';
import { I18nProvider } from '@/i18n/context';
import { ThemeProvider } from '@/theme/context';

export const metadata: Metadata = {
  title: "CarBook | دفتر ومتابعة صيانة واستهلاك السيارة",
  description: "CarBook - نظام ذكي وبسيط لتسجيل ومتابعة صيانة وبنزين السيارات مع التنبيهات الدورية والتقارير",
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/icon.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    apple: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
  },
  appleWebApp: {
    capable: true,
    title: 'CarBook',
    statusBarStyle: 'black-translucent',
  },
};

// viewport-fit=cover + themeColor so the installed PWA (iOS/Android) blends its
// safe-area insets with the app chrome; themeColor must live here in Next 15.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" data-theme="material">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased">
        <ThemeProvider>
          <I18nProvider>
            {children}
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
