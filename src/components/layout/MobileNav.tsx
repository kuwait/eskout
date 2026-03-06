// src/components/layout/MobileNav.tsx
// Bottom tab navigation for mobile devices (5 tabs)
// Primary navigation method for scouts using the app at the field
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/AgeGroupSelector.tsx, src/app/layout.tsx

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, ShieldCheck, Users, GitBranch, Bell, FileText, PlusCircle, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertCounts } from '@/components/layout/AppShell';

const TABS = [
  { href: '/', label: 'Jogadores', icon: Users, scoutHidden: true, scoutOnly: false },
  { href: '/campo/real', label: 'Plantel', icon: ShieldCheck, scoutHidden: true, scoutOnly: false },
  { href: '/campo/sombra', label: 'Sombra', icon: Shield, scoutHidden: true, scoutOnly: false },
  { href: '/pipeline', label: 'Abordagens', icon: GitBranch, scoutHidden: true, scoutOnly: false },
  { href: '/alertas', label: 'Prioritárias', icon: Bell, scoutHidden: true, scoutOnly: false },
  { href: '/meus-relatorios', label: 'Relatórios', icon: FileText, scoutHidden: false, scoutOnly: true },
  { href: '/submeter', label: 'Submeter', icon: PlusCircle, scoutHidden: false, scoutOnly: true },
  { href: '/mais', label: 'Mais', icon: Menu, scoutHidden: false, scoutOnly: false },
];

export function MobileNav({ alertCounts, userRole }: { alertCounts: AlertCounts; userRole: string }) {
  const pathname = usePathname();
  const isScout = userRole === 'scout';
  const visibleTabs = isScout
    ? TABS.filter((t) => !t.scoutHidden)
    : TABS.filter((t) => !t.scoutOnly);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white lg:hidden">
      <ul className="flex">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.href === '/'
            ? pathname === '/'
            : pathname.startsWith(tab.href);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                  isActive ? 'text-neutral-900 font-medium' : 'text-neutral-400'
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {/* Alert badges */}
                  {tab.href === '/alertas' && (alertCounts.urgente > 0 || alertCounts.importante > 0) && (
                    <span className="absolute -right-2.5 -top-1.5 flex items-center gap-px">
                      {alertCounts.urgente > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">{alertCounts.urgente}</span>
                      )}
                      {alertCounts.importante > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[9px] font-bold leading-none text-neutral-800">{alertCounts.importante}</span>
                      )}
                    </span>
                  )}
                </span>
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
