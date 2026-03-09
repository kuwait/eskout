// src/components/reports/ReportTabNav.tsx
// Tab navigation for admin reports section — Relatórios, Scouts, Consenso
// Client component for usePathname-based active state
// RELEVANT FILES: src/app/admin/relatorios/layout.tsx

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, BarChart3, Users } from 'lucide-react';

const TABS = [
  { href: '/admin/relatorios', label: 'Relatórios', icon: FileText, exact: true },
  { href: '/admin/relatorios/scouts', label: 'Scouts', icon: BarChart3, exact: false },
  { href: '/admin/relatorios/consenso', label: 'Consenso', icon: Users, exact: false },
];

export function ReportTabNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex gap-1 rounded-lg border bg-neutral-50 p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        // Exact match for main tab (exclude /[id] detail pages), startsWith for sub-tabs
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
            {/* Mobile: show short label */}
            <span className="sm:hidden">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
