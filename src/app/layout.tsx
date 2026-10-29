import './globals.css';
import type { Metadata } from 'next';
import { I18nProvider } from '@/i18n/context';

export const metadata: Metadata = {
  title: "CarBook | دفتر ومتابعة صيانة واستهلاك السيارة",
  description: "CarBook - نظام ذكي وبسيط لتسجيل ومتابعة صيانة وبنزين السيارات مع التنبيهات الدورية والتقارير",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased" style={{ fontFamily: "'Cairo', sans-serif" }}>
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
