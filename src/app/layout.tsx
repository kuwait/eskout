// src/app/layout.tsx
// Root layout: Inter font, AgeGroupProvider, conditional sidebar/mobile nav
// Wraps all pages with authentication-aware layout and persistent age group context
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/MobileNav.tsx, src/hooks/useAgeGroup.ts

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Eskout — Plataforma de Scouting',
  description: 'Gestão de recrutamento de formação',
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
      </body>
    </html>
  );
}
