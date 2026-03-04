// src/components/layout/AppShellClient.tsx
// Client-side shell with AgeGroupProvider, sidebar and mobile nav
// Separates client interactivity from server-side data fetching in AppShell
// RELEVANT FILES: src/components/layout/AppShell.tsx, src/hooks/useAgeGroup.ts, src/components/layout/Sidebar.tsx

'use client';

import { usePathname } from 'next/navigation';
import { AgeGroupProvider } from '@/hooks/useAgeGroup';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { AgeGroupSelector } from '@/components/layout/AgeGroupSelector';
import type { AgeGroup } from '@/lib/types';

const PUBLIC_ROUTES = ['/login'];

export function AppShellClient({
  children,
  ageGroups,
}: {
  children: React.ReactNode;
  ageGroups: AgeGroup[];
}) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  // Public pages render without navigation
  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AgeGroupProvider ageGroups={ageGroups}>
      <Sidebar />
      {/* Mobile header with age group selector */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden">
        <span className="text-lg font-bold tracking-tight">Eskout</span>
        <AgeGroupSelector />
      </header>
      {/* Main content area — offset for sidebar on desktop, bottom nav on mobile */}
      <main className="pb-16 lg:ml-64 lg:pb-0">
        {children}
      </main>
      <MobileNav />
    </AgeGroupProvider>
  );
}
