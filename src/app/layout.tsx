// src/app/layout.tsx
// Root layout: Inter font, AgeGroupProvider, conditional sidebar/mobile nav
// Wraps all pages with authentication-aware layout and persistent age group context
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/MobileNav.tsx, src/hooks/useAgeGroup.ts

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

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
    <html lang="pt">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppShell>{children}</AppShell>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
