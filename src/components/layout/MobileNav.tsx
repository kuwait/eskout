// src/components/layout/MobileNav.tsx
// Bottom tab navigation for mobile devices (5 tabs)
// Primary navigation method for scouts using the app at the field
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/AgeGroupSelector.tsx, src/app/layout.tsx

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Users, GitBranch, CalendarDays, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: 'Jogadores', icon: Users },
  { href: '/campo/real', label: 'Plantel', icon: Shield },
  { href: '/pipeline', label: 'Abordagens', icon: GitBranch },
  { href: '/calendario', label: 'Agenda', icon: CalendarDays },
  { href: '/mais', label: 'Mais', icon: Menu },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white lg:hidden">
      <ul className="flex">
        {TABS.map((tab) => {
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
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
