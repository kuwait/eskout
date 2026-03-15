// src/app/master/MasterSidebar.tsx
// Sidebar + mobile drawer for superadmin panel — Dashboard, Clubes, Utilizadores, Online
// Desktop: fixed sidebar. Mobile: hamburger header + slide-out drawer.
// RELEVANT FILES: src/app/master/layout.tsx, src/components/layout/Sidebar.tsx

'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, Users, Wifi, Trophy, ArrowLeftRight, Palette, LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/master', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/master/clubes', label: 'Clubes', icon: Building2, exact: false },
  { href: '/master/utilizadores', label: 'Utilizadores', icon: Users, exact: false },
  { href: '/master/online', label: 'Online', icon: Wifi, exact: false },
  { href: '/master/competicoes', label: 'Competições FPF', icon: Trophy, exact: false },
];

/* ───────────── Shared nav content ───────────── */

function NavContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-purple-600 text-white'
                      : 'text-muted-foreground hover:bg-purple-50 hover:text-purple-700'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom actions */}
      <div className="border-t px-3 py-3 space-y-1">
        <Link
          href="/escolher-clube"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Trocar Clube
        </Link>
        <Link
          href="/preferencias"
          onClick={onNavigate}
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
    </>
  );
}

/* ───────────── Main export ───────────── */

export function MasterSidebar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:bg-white lg:h-screen lg:fixed lg:left-0 lg:top-0">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <Image src="/logo-icon.svg" alt="" width={28} height={28} />
          <span className="text-xl font-bold tracking-tight text-purple-700">Gestão Eskout</span>
        </div>
        <NavContent pathname={pathname} />
      </aside>

      {/* Mobile header with hamburger */}
      <header className="sticky top-0 z-40 flex items-center border-b bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="mr-3 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/logo-icon.svg" alt="" width={24} height={24} />
          <span className="text-lg font-bold tracking-tight text-purple-700">Gestão Eskout</span>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer panel */}
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-4">
              <div className="flex items-center gap-2">
                <Image src="/logo-icon.svg" alt="" width={28} height={28} />
                <span className="text-xl font-bold tracking-tight text-purple-700">Gestão Eskout</span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavContent pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
