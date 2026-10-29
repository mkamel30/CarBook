import './globals.css';
import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cairo',
  display: 'swap',
});

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
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
