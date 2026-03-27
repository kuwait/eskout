// src/components/layout/nav-items.ts
// Shared navigation item definitions and role-based filtering logic
// Extracted from Sidebar + MobileDrawer to avoid duplication and enable testing
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/MobileDrawer.tsx, src/components/layout/__tests__/nav-items.test.ts

import type { LucideIcon } from 'lucide-react';
import {
  Shield, ShieldCheck, Users, GitBranch, CalendarDays,
  FileText, PlusCircle, ListTodo, DatabaseZap, Binoculars,
} from 'lucide-react';

/* ───────────── Types ───────────── */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  scoutHidden?: boolean;
  scoutOnly?: boolean;
  recruiterHidden?: boolean;
  onlyRoles?: string[];
  feature: string | null;
}

export interface AdminItem {
  href: string;
  label: string;
  icon: LucideIcon;
  feature: string | null;
}

/* ───────────── Data ───────────── */

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Jogadores', icon: Users, scoutHidden: true, feature: null },
  { href: '/campo/real', label: 'Planteis', icon: ShieldCheck, scoutHidden: true, feature: null },
  { href: '/campo/sombra', label: 'Planteis Sombra', icon: Shield, scoutHidden: true, feature: 'shadow_squad' },
  { href: '/pipeline', label: 'Abordagens', icon: GitBranch, scoutHidden: true, feature: 'pipeline' },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays, scoutHidden: true, feature: 'calendar' },
  { href: '/observacoes', label: 'Observações', icon: Binoculars, scoutHidden: false, feature: null },
  { href: '/tarefas', label: 'Tarefas', icon: ListTodo, scoutHidden: true, feature: null },
  { href: '/meus-relatorios', label: 'Meus Relatórios', icon: FileText, scoutHidden: false, scoutOnly: true, feature: 'scout_submissions' },
  { href: '/submeter', label: 'Submeter Relatório', icon: PlusCircle, scoutHidden: false, scoutOnly: true, feature: 'scout_submissions' },
  { href: '/meus-jogadores', label: 'Jogadores', icon: Users, scoutHidden: false, onlyRoles: ['scout'], feature: null },
];

export const ADMIN_ITEMS: AdminItem[] = [
  { href: '/definicoes', label: 'Clube', icon: Shield, feature: null },
  { href: '/admin/utilizadores', label: 'Utilizadores', icon: FileText, feature: null },
  { href: '/admin/dados', label: 'Dados', icon: DatabaseZap, feature: null },
];

/* ───────────── Filtering ───────────── */

/** Filter nav items by user role and club feature toggles */
export function filterNavItems(
  role: string,
  features: Record<string, boolean>,
): NavItem[] {
  const isScout = role === 'scout';
  const isRecruiter = role === 'recruiter';

  return (isScout
    ? NAV_ITEMS.filter((i) => !i.scoutHidden)
    : NAV_ITEMS.filter((i) => !i.scoutOnly)
  )
    .filter((i) => !isRecruiter || !i.recruiterHidden)
    .filter((i) => !i.onlyRoles || i.onlyRoles.includes(role))
    .filter((i) => !i.feature || features[i.feature] !== false);
}

/** Filter admin items by feature toggles */
export function filterAdminItems(
  features: Record<string, boolean>,
): AdminItem[] {
  return ADMIN_ITEMS.filter(
    (i) => !i.feature || features[i.feature] !== false,
  );
}
