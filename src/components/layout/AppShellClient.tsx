// src/components/layout/AppShellClient.tsx
// Client-side shell with AgeGroupProvider, sidebar and mobile drawer
// Age group selection is per-page, not global in the header
// RELEVANT FILES: src/components/layout/AppShell.tsx, src/hooks/useAgeGroup.tsx, src/components/layout/Sidebar.tsx

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { AgeGroupProvider } from '@/hooks/useAgeGroup';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import type { AgeGroup } from '@/lib/types';
import type { AlertCounts } from '@/components/layout/AppShell';

const PUBLIC_ROUTES = ['/login'];

export function AppShellClient({
  children,
  ageGroups,
  alertCounts,
  userRole,
}: {
  children: React.ReactNode;
  ageGroups: AgeGroup[];
  alertCounts: AlertCounts;
  userRole: string;
}) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AgeGroupProvider ageGroups={ageGroups}>
      <Sidebar alertCounts={alertCounts} userRole={userRole} />

      {/* Mobile header with hamburger */}
      <header className="sticky top-0 z-40 flex items-center border-b bg-card px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="mr-3 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/logo-icon.svg" alt="" width={24} height={24} className="dark:invert" />
          <span className="text-lg font-bold tracking-tight">Eskout</span>
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        alertCounts={alertCounts}
        userRole={userRole}
      />

      {/* Main content area — overflow-x-clip prevents horizontal page scroll without breaking sticky positioning */}
      <main className="overflow-x-clip lg:ml-64">
        {children}
      </main>
    </AgeGroupProvider>
  );
}
