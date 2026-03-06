// src/components/layout/AppShellClient.tsx
// Client-side shell with AgeGroupProvider, sidebar and mobile nav
// Age group selection is per-page, not global in the header
// RELEVANT FILES: src/components/layout/AppShell.tsx, src/hooks/useAgeGroup.tsx, src/components/layout/Sidebar.tsx

'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { AgeGroupProvider } from '@/hooks/useAgeGroup';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import type { AgeGroup } from '@/lib/types';
import type { AlertCounts } from '@/components/layout/AppShell';

const PUBLIC_ROUTES = ['/login'];

export function AppShellClient({
  children,
  ageGroups,
  alertCounts,
}: {
  children: React.ReactNode;
  ageGroups: AgeGroup[];
  alertCounts: AlertCounts;
}) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AgeGroupProvider ageGroups={ageGroups}>
      <Sidebar alertCounts={alertCounts} />
      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Image src="/logo-icon.svg" alt="" width={24} height={24} />
          <span className="text-lg font-bold tracking-tight">Eskout</span>
        </div>
      </header>
      {/* Main content area — overflow-x-clip prevents horizontal page scroll without breaking sticky positioning */}
      <main className="overflow-x-clip pb-16 lg:ml-64 lg:pb-0">
        {children}
      </main>
      <MobileNav alertCounts={alertCounts} />
    </AgeGroupProvider>
  );
}
