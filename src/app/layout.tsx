import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { PreviewBanner } from '@/components/layout/preview-banner';

export const metadata: Metadata = {
  title: 'TraceCase — Autonomous Defect Reproduction',
  description: 'Deterministic web application bug reproduction and verifiable evidence pipeline.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-brand-navy flex flex-col antialiased">
        <PreviewBanner />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-neutral-surface/30">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
