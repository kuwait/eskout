// src/app/master/MasterSidebar.tsx
// Sidebar for superadmin panel — Dashboard, Clubes
// Mirrors club sidebar structure but with platform-level navigation
// RELEVANT FILES: src/app/master/layout.tsx, src/components/layout/Sidebar.tsx

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, Users, ArrowLeftRight, Palette, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/master', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/master/clubes', label: 'Clubes', icon: Building2, exact: false },
  { href: '/master/utilizadores', label: 'Utilizadores', icon: Users, exact: false },
];

export function MasterSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:bg-white lg:h-screen lg:fixed lg:left-0 lg:top-0">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-4">
        <Image src="/logo-icon.svg" alt="" width={28} height={28} />
        <span className="text-xl font-bold tracking-tight text-purple-700">Gestão Eskout</span>
      </div>

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
