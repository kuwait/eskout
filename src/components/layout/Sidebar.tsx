// src/components/layout/Sidebar.tsx
// Desktop sidebar navigation for the Eskout application
// Shows club name/logo, feature-gated nav items, superadmin link
// RELEVANT FILES: src/components/layout/MobileDrawer.tsx, src/components/layout/AppShellClient.tsx, src/app/layout.tsx

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserPlus, LogOut, Palette, ArrowLeftRight, Building2, List, Columns2, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { filterNavItems, filterAdminItems } from '@/components/layout/nav-items';
import type { AlertCounts, ClubInfo } from '@/components/layout/AppShell';

export function Sidebar({
  alertCounts,
  userRole,
  clubInfo,
  isSuperadmin,
  isDemo = false,
}: {
  alertCounts: AlertCounts;
  userRole: string;
  clubInfo: ClubInfo | null;
  isSuperadmin: boolean;
  isDemo?: boolean;
}) {
  const pathname = usePathname();
  const isScout = userRole === 'scout';
  const isRecruiter = userRole === 'recruiter';
  const features = clubInfo?.features ?? {};

  const visibleItems = filterNavItems(userRole, features);
  const visibleAdminItems = filterAdminItems(features);

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:bg-card lg:h-screen lg:fixed lg:left-0 lg:top-0">
      {/* Header — club name + logo */}
      <div className="flex items-center gap-2 border-b px-4 py-4">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          {clubInfo?.logoUrl ? (
            <Image src={clubInfo.logoUrl} alt="" width={28} height={28} className="rounded shrink-0" />
          ) : (
            <Image src="/logo-icon.svg" alt="" width={28} height={28} className="dark:invert shrink-0" />
          )}
          <span className="text-xl font-bold tracking-tight truncate">
            {clubInfo?.name ?? 'Eskout'}
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {/* Pending tasks badge + flagged notes indicator */}
                  {item.href === '/tarefas' && (alertCounts.pendingTasks > 0 || alertCounts.urgente > 0 || alertCounts.importante > 0) && (
                    <span className="ml-auto flex items-center gap-1">
                      {alertCounts.pendingTasks > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
                          {alertCounts.pendingTasks}
                        </span>
                      )}
                      {alertCounts.urgente > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {alertCounts.urgente}
                        </span>
                      )}
                    </span>
                  )}
                </Link>
                {/* Sub-item: Adicionados (pending players) — under Jogadores, admin/editor only */}
                {item.href === '/' && !isScout && !isRecruiter && (userRole === 'admin' || userRole === 'editor') && (
                  <Link
                    href="/admin/pendentes"
                    className={cn(
                      'mt-0.5 flex items-center gap-2.5 rounded-md py-1.5 pl-10 pr-3 text-[13px] font-medium transition-colors',
                      pathname.startsWith('/admin/pendentes')
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Adicionados
                    {alertCounts.pendingPlayers > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {alertCounts.pendingPlayers}
                      </span>
                    )}
                  </Link>
                )}
                {/* Sub-item: Listas — under Jogadores, admin/editor/recruiter */}
                {item.href === '/' && !isScout && (
                  <Link
                    href="/listas"
                    className={cn(
                      'mt-0.5 flex items-center gap-2.5 rounded-md py-1.5 pl-10 pr-3 text-[13px] font-medium transition-colors',
                      pathname.startsWith('/listas')
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <List className="h-3.5 w-3.5" />
                    Listas
                  </Link>
                )}
                {/* Sub-item: Comparar — under Jogadores, admin/editor/recruiter */}
                {item.href === '/' && !isScout && (
                  <Link
                    href="/comparar"
                    className={cn(
                      'mt-0.5 flex items-center gap-2.5 rounded-md py-1.5 pl-10 pr-3 text-[13px] font-medium transition-colors',
                      pathname.startsWith('/comparar')
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    Comparar
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {/* Admin section — only visible to admins */}
        {userRole === 'admin' && (
        <div className="mt-6">
          <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">Admin</p>
          <ul className="mt-2 space-y-1">
            {visibleAdminItems.map((item) => {
              const Icon = item.icon;
              // Exact match for /definicoes (Clube) to avoid highlighting when sub-page Plantéis is active
              const isActive = item.href === '/definicoes'
                ? pathname === '/definicoes'
                : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {/* Pending reports badge */}
                    {item.href === '/admin/relatorios' && alertCounts.pendingReports > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {alertCounts.pendingReports}
                      </span>
                    )}
                  </Link>
                  {/* Sub-item: Plantéis — under Clube */}
                  {item.href === '/definicoes' && (
                    <Link
                      href="/definicoes/planteis"
                      className={cn(
                        'mt-0.5 flex items-center gap-2.5 rounded-md py-1.5 pl-10 pr-3 text-[13px] font-medium transition-colors',
                        pathname.startsWith('/definicoes/planteis')
                          ? 'bg-neutral-900 text-white'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                      )}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      Plantéis
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        )}

      </nav>

      {/* Bottom actions */}
      <div className="border-t px-3 py-3 space-y-1">
        {isSuperadmin && (
          <Link
            href="/master"
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/master')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Building2 className="h-4 w-4" />
            Gestão Admin Eskout
          </Link>
        )}
        <Link
          href="/escolher-clube"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Trocar Clube
        </Link>
        <Link
          href="/preferencias"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/preferencias'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Palette className="h-4 w-4" />
          Preferências
        </Link>
        <form action={logout}>
          <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" type="submit">
            <LogOut className="h-4 w-4" />
            {isDemo ? 'Sair da Demo' : 'Sair'}
          </Button>
        </form>
      </div>
    </aside>
  );
}
