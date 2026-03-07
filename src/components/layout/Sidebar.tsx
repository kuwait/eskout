// src/components/layout/Sidebar.tsx
// Desktop sidebar navigation for the Eskout application
// Jogadores is the home page. Plantel Real and Plantel Sombra separated.
// RELEVANT FILES: src/components/layout/MobileNav.tsx, src/components/layout/AgeGroupSelector.tsx, src/app/layout.tsx

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield, ShieldCheck, Users, GitBranch, CalendarDays, Bell, FileText, PlusCircle,
  Download, UserCog, Settings, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import type { AlertCounts } from '@/components/layout/AppShell';

const NAV_ITEMS = [
  { href: '/', label: 'Jogadores', icon: Users, scoutHidden: true },
  { href: '/campo/real', label: 'Planteis', icon: ShieldCheck, scoutHidden: true },
  { href: '/campo/sombra', label: 'Planteis Sombra', icon: Shield, scoutHidden: true },
  { href: '/pipeline', label: 'Abordagens', icon: GitBranch, scoutHidden: true },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays, scoutHidden: true },
  { href: '/alertas', label: 'Notas Prioritárias', icon: Bell, scoutHidden: true },
  { href: '/meus-relatorios', label: 'Meus Relatórios', icon: FileText, scoutHidden: false, scoutOnly: true },
  { href: '/submeter', label: 'Submeter Relatório', icon: PlusCircle, scoutHidden: false, scoutOnly: true },
];

const ADMIN_ITEMS = [
  { href: '/admin/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/definicoes', label: 'Definições', icon: Settings },
  { href: '/exportar', label: 'Exportar', icon: Download },
  { href: '/admin/utilizadores', label: 'Utilizadores', icon: UserCog },
];

export function Sidebar({ alertCounts, userRole }: { alertCounts: AlertCounts; userRole: string }) {
  const pathname = usePathname();
  const isScout = userRole === 'scout';
  const visibleItems = isScout
    ? NAV_ITEMS.filter((i) => !i.scoutHidden)
    : NAV_ITEMS.filter((i) => !i.scoutOnly);

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:bg-white lg:h-screen lg:fixed lg:left-0 lg:top-0">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-icon.svg" alt="" width={28} height={28} className="dark:invert" />
          <span className="text-xl font-bold tracking-tight">Eskout</span>
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
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {/* Alert badges on Alertas tab */}
                  {item.href === '/alertas' && (alertCounts.urgente > 0 || alertCounts.importante > 0) && (
                    <span className="ml-auto flex items-center gap-1">
                      {alertCounts.urgente > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{alertCounts.urgente}</span>
                      )}
                      {alertCounts.importante > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[10px] font-bold text-neutral-800">{alertCounts.importante}</span>
                      )}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Admin section — only visible to admins */}
        {userRole === 'admin' && (
        <div className="mt-6">
          <p className="px-3 text-xs font-semibold uppercase text-neutral-400">Admin</p>
          <ul className="mt-2 space-y-1">
            {ADMIN_ITEMS.map((item) => {
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

      {/* Logout */}
      <div className="border-t px-3 py-3">
        <form action={logout}>
          <Button variant="ghost" className="w-full justify-start gap-3 text-neutral-600" type="submit">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </form>
      </div>
    </aside>
  );
}
