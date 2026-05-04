// src/components/layout/AppShellClient.tsx
// Client-side shell with AgeGroupProvider, RealtimeProvider, sidebar, mobile drawer, and club context
// Age group selection is per-page, not global in the header
// RELEVANT FILES: src/components/layout/AppShell.tsx, src/hooks/useAgeGroup.tsx, src/lib/realtime/RealtimeProvider.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { AgeGroupProvider } from '@/hooks/useAgeGroup';
import { RealtimeProvider } from '@/lib/realtime/RealtimeProvider';
import { useRealtimeBadges } from '@/hooks/useRealtimeBadges';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { RoleImpersonator } from '@/components/layout/RoleImpersonator';
import { updateLastSeen } from '@/actions/presence';
import type { AgeGroup } from '@/lib/types';
import type { AlertCounts, ClubInfo, SidebarList } from '@/components/layout/AppShell';

const PUBLIC_ROUTES = ['/login'];
const NO_SHELL_ROUTES = ['/escolher-clube', '/master'];

export function AppShellClient({
  children,
  ageGroups,
  alertCounts,
  userRole,
  userId,
  userName,
  clubInfo,
  isSuperadmin,
  canViewCompetitions = false,
  sidebarLists = [],
}: {
  children: React.ReactNode;
  ageGroups: AgeGroup[];
  alertCounts: AlertCounts;
  userRole: string;
  userId: string;
  userName: string;
  clubInfo: ClubInfo | null;
  isSuperadmin: boolean;
  canViewCompetitions?: boolean;
  sidebarLists?: SidebarList[];
}) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const isNoShell = NO_SHELL_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));

  // Heartbeat: update presence every 15 minutes (page, device, last_seen_at)
  // pathname tracked via ref to avoid re-firing on every navigation (was causing duplicate POSTs)
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => {
    if (isPublic || !userId) return;
    const device = window.innerWidth < 768 ? 'mobile' : 'desktop';
    // Fire immediately on mount
    updateLastSeen(pathnameRef.current, device);
    const interval = setInterval(() => {
      const dev = window.innerWidth < 768 ? 'mobile' : 'desktop';
      updateLastSeen(pathnameRef.current, dev);
    }, 900_000); // 15 minutes — reduced from 5 min to save Vercel CPU + Supabase queries
    return () => clearInterval(interval);
  }, [isPublic, userId]); // eslint-disable-line react-hooks/exhaustive-deps -- pathname tracked via ref

  // No shell on public routes or club picker
  if (isPublic || isNoShell) {
    return <>{children}</>;
  }

  // Wrap with RealtimeProvider only when we have a club context
  const shell = (
    <AgeGroupProvider ageGroups={ageGroups}>
      <ShellContent
        alertCounts={alertCounts}
        userRole={userRole}
        userId={userId}
        clubInfo={clubInfo}
        isSuperadmin={isSuperadmin}
        canViewCompetitions={canViewCompetitions}
        sidebarLists={sidebarLists}
      >
        {children}
      </ShellContent>
    </AgeGroupProvider>
  );

  if (clubInfo?.id && userId) {
    return (
      <RealtimeProvider
        clubId={clubInfo.id}
        userId={userId}
        userName={userName}
        userRole={userRole}
      >
        {shell}
      </RealtimeProvider>
    );
  }

  return shell;
}

/* ───────────── Inner Shell with Live Badges ───────────── */

function ShellContent({
  children,
  alertCounts: initialAlertCounts,
  userRole,
  userId,
  clubInfo,
  isSuperadmin,
  canViewCompetitions = false,
  sidebarLists = [],
}: {
  children: React.ReactNode;
  alertCounts: AlertCounts;
  userRole: string;
  userId: string;
  clubInfo: ClubInfo | null;
  isSuperadmin: boolean;
  canViewCompetitions?: boolean;
  sidebarLists?: SidebarList[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Live badge counts — updates via Realtime when other users make changes
  const alertCounts = useRealtimeBadges(initialAlertCounts, userId, clubInfo?.id ?? null);

  return (
    <>
      <Sidebar alertCounts={alertCounts} userRole={userRole} clubInfo={clubInfo} isSuperadmin={isSuperadmin} canViewCompetitions={canViewCompetitions} sidebarLists={sidebarLists} />

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
          {clubInfo?.logoUrl ? (
            <Image src={clubInfo.logoUrl} alt="" width={24} height={24} className="rounded" />
          ) : (
            <Image src="/logo-icon.svg" alt="" width={24} height={24} className="dark:invert" />
          )}
          <span className="text-lg font-bold tracking-tight">
            {clubInfo?.name ?? 'Eskout'}
          </span>
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        alertCounts={alertCounts}
        userRole={userRole}
        clubInfo={clubInfo}
        isSuperadmin={isSuperadmin}
        canViewCompetitions={canViewCompetitions}
        sidebarLists={sidebarLists}
      />

      {/* Main content area — overflow-x-clip prevents horizontal page scroll without breaking sticky positioning */}
      <main className="overflow-x-clip lg:ml-64">
        {children}
      </main>

      {/* Superadmin role impersonation — floating pill */}
      {isSuperadmin && <RoleImpersonator currentRole={userRole} />}
    </>
  );
}
