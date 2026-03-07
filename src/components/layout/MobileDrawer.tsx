// src/components/layout/MobileDrawer.tsx
// Slide-out hamburger menu for mobile — mirrors desktop sidebar structure
// Replaces bottom tab bar for better UX on iPhone and small screens
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/AppShellClient.tsx, src/components/ui/sheet.tsx

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield, ShieldCheck, Users, GitBranch, CalendarDays, Bell,
  FileText, PlusCircle, Download, UserCog, Settings, LogOut, Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose,
} from '@/components/ui/sheet';
import type { AlertCounts } from '@/components/layout/AppShell';

/* ───────────── Navigation Items ───────────── */

const NAV_ITEMS = [
  { href: '/', label: 'Jogadores', icon: Users, scoutHidden: true, scoutOnly: false },
  { href: '/campo/real', label: 'Planteis', icon: ShieldCheck, scoutHidden: true, scoutOnly: false },
  { href: '/campo/sombra', label: 'Planteis Sombra', icon: Shield, scoutHidden: true, scoutOnly: false },
  { href: '/pipeline', label: 'Abordagens', icon: GitBranch, scoutHidden: true, scoutOnly: false },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays, scoutHidden: true, scoutOnly: false },
  { href: '/alertas', label: 'Notas Prioritárias', icon: Bell, scoutHidden: true, scoutOnly: false },
  { href: '/meus-relatorios', label: 'Meus Relatórios', icon: FileText, scoutHidden: false, scoutOnly: true },
  { href: '/submeter', label: 'Submeter Relatório', icon: PlusCircle, scoutHidden: false, scoutOnly: true },
];

const ADMIN_ITEMS = [
  { href: '/admin/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/definicoes', label: 'Definições', icon: Settings },
  { href: '/exportar', label: 'Exportar', icon: Download },
  { href: '/admin/utilizadores', label: 'Utilizadores', icon: UserCog },
];

/* ───────────── Component ───────────── */

export function MobileDrawer({
  open,
  onOpenChange,
  alertCounts,
  userRole,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alertCounts: AlertCounts;
  userRole: string;
}) {
  const pathname = usePathname();
  const isScout = userRole === 'scout';

  const visibleItems = isScout
    ? NAV_ITEMS.filter((i) => !i.scoutHidden)
    : NAV_ITEMS.filter((i) => !i.scoutOnly);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-72 p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Image src="/logo-icon.svg" alt="" width={28} height={28} className="dark:invert" />
            <span className="text-xl font-bold tracking-tight">Eskout</span>
          </SheetTitle>
        </SheetHeader>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));

              return (
                <li key={item.href}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                      {/* Alert badges */}
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
                  </SheetClose>
                </li>
              );
            })}
          </ul>

          {/* Admin section */}
          {userRole === 'admin' && (
            <div className="mt-6">
              <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">Admin</p>
              <ul className="mt-2 space-y-1">
                {ADMIN_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          {item.label}
                          {/* Pending reports badge */}
                          {item.href === '/admin/relatorios' && alertCounts.pendingReports > 0 && (
                            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                              {alertCounts.pendingReports}
                            </span>
                          )}
                        </Link>
                      </SheetClose>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t px-3 py-3 space-y-1">
          <SheetClose asChild>
            <Link
              href="/preferencias"
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                pathname === '/preferencias'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Palette className="h-5 w-5" />
              Preferências
            </Link>
          </SheetClose>
          <form action={logout}>
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" type="submit">
              <LogOut className="h-5 w-5" />
              Sair
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
