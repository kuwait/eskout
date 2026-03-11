// src/components/layout/Sidebar.tsx
// Desktop sidebar navigation for the Eskout application
// Shows club name/logo, feature-gated nav items, superadmin link
// RELEVANT FILES: src/components/layout/MobileDrawer.tsx, src/components/layout/AppShellClient.tsx, src/app/layout.tsx

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield, ShieldCheck, Users, GitBranch, CalendarDays, FileText, PlusCircle, UserPlus,
  Download, UserCog, LogOut, Palette, ArrowLeftRight, ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import type { AlertCounts, ClubInfo } from '@/components/layout/AppShell';

const NAV_ITEMS = [
  { href: '/', label: 'Jogadores', icon: Users, scoutHidden: true, recruiterHidden: true, feature: null },
  { href: '/campo/real', label: 'Planteis', icon: ShieldCheck, scoutHidden: true, feature: null },
  { href: '/campo/sombra', label: 'Planteis Sombra', icon: Shield, scoutHidden: true, feature: 'shadow_squad' },
  { href: '/pipeline', label: 'Abordagens', icon: GitBranch, scoutHidden: true, feature: 'pipeline' },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays, scoutHidden: true, feature: 'calendar' },
  { href: '/tarefas', label: 'Tarefas', icon: ListTodo, scoutHidden: true, feature: null },
  { href: '/meus-relatorios', label: 'Meus Relatórios', icon: FileText, scoutHidden: false, scoutOnly: true, feature: 'scout_submissions' },
  { href: '/submeter', label: 'Submeter Relatório', icon: PlusCircle, scoutHidden: false, scoutOnly: true, feature: 'scout_submissions' },
  { href: '/meus-jogadores', label: 'Jogadores', icon: Users, scoutHidden: false, onlyRoles: ['scout', 'recruiter'], feature: null },
];

const ADMIN_ITEMS = [
  { href: '/admin/relatorios', label: 'Relatórios', icon: FileText, feature: 'scouting_reports' },
  { href: '/definicoes', label: 'Clube', icon: Shield, feature: null },
  { href: '/exportar', label: 'Exportar', icon: Download, feature: 'export' },
  { href: '/admin/utilizadores', label: 'Utilizadores', icon: UserCog, feature: null },
];

export function Sidebar({
  alertCounts,
  userRole,
  clubInfo,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSuperadmin,
}: {
  alertCounts: AlertCounts;
  userRole: string;
  clubInfo: ClubInfo | null;
  isSuperadmin: boolean;
}) {
  const pathname = usePathname();
  const isScout = userRole === 'scout';
  const isRecruiter = userRole === 'recruiter';
  const features = clubInfo?.features ?? {};

  // Filter nav items by role and feature toggles
  const visibleItems = (isScout
    ? NAV_ITEMS.filter((i) => !i.scoutHidden)
    : NAV_ITEMS.filter((i) => !('scoutOnly' in i && i.scoutOnly))
  ).filter((i) => !isRecruiter || !('recruiterHidden' in i && i.recruiterHidden))
   .filter((i) => !('onlyRoles' in i && i.onlyRoles) || (i.onlyRoles as string[]).includes(userRole))
   .filter((i) => !i.feature || features[i.feature] !== false);

  const visibleAdminItems = ADMIN_ITEMS.filter(
    (i) => !i.feature || features[i.feature] !== false
  );

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
              const isActive = pathname.startsWith(item.href);
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
                </li>
              );
            })}
          </ul>
        </div>
        )}

      </nav>

      {/* Bottom actions */}
      <div className="border-t px-3 py-3 space-y-1">
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
            Sair
          </Button>
        </form>
      </div>
    </aside>
  );
}
