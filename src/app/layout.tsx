import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Car Maintenance Followup | متابعة صيانة واستهلاك السيارة",
  description: "نظام بسيط لتسجيل ومتابعة صيانة وبنزين السيارات مع التنبيهات الذكية والتقارير",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
