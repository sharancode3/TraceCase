import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { PreviewBanner } from '@/components/layout/preview-banner';
import { TourProvider } from '@/components/guide/tour-context';
import { OnboardingTour } from '@/components/guide/onboarding-tour';
import { FirstUseGuideModal } from '@/components/guide/first-use-guide-modal';
import { isDevPreviewEnabled } from '@/server/config/env';

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  title: 'TraceCase — Autonomous Defect Reproduction',
  description: 'Deterministic web application bug reproduction and verifiable evidence pipeline.',
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isSyntheticPreview = isDevPreviewEnabled();

  return (
    <html lang="en" suppressHydrationWarning className={`h-full ${dmSans.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('tc-theme')==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}`,
          }}
        />
      </head>
      <body className="h-screen max-h-screen overflow-hidden bg-canvas dark:bg-slate-950 text-brand-navy dark:text-slate-100 flex flex-col antialiased transition-colors duration-150">
        <TourProvider>
          <OnboardingTour />
          <FirstUseGuideModal />
          <PreviewBanner isSyntheticPreview={isSyntheticPreview} />
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
              <Header />
              <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-neutral-surface/30 dark:bg-slate-900/60">
                {children}
              </main>
            </div>
          </div>
        </TourProvider>
      </body>
    </html>
  );
}

