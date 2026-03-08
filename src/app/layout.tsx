// src/app/layout.tsx
// Root layout: Inter font, AgeGroupProvider, conditional sidebar/mobile nav
// Wraps all pages with authentication-aware layout and persistent age group context
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/MobileDrawer.tsx, src/hooks/useAgeGroup.ts

import type { Metadata, Viewport } from 'next';
import { Inter, DM_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/lib/theme';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

/* viewport-fit=cover enables env(safe-area-inset-*) for iPhone notch/dynamic island */
/* maximumScale=1 + userScalable=false disables pinch-to-zoom across the app */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Eskout — Plataforma de Scouting',
  description: 'Gestão de recrutamento de formação',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Eskout — Plataforma de Scouting',
    description: 'Gestão de recrutamento de formação',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Eskout — Plataforma de Scouting',
    description: 'Gestão de recrutamento de formação',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <head>
        {/* Anti-FOUC: apply saved theme before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('eskout-theme');if(t&&t!=='eskout')document.documentElement.setAttribute('data-theme',t)}catch(e){}` }} />
        {/* Register minimal service worker for PWA install prompt */}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')` }} />
      </head>
      <body className={`${inter.variable} ${dmSans.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
