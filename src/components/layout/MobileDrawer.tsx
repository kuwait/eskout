// src/components/layout/MobileDrawer.tsx
// Slide-out hamburger menu for mobile — mirrors desktop sidebar structure
// Uses plain div (always in DOM, no Radix Portal) for instant response
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/AppShellClient.tsx, src/app/layout.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserPlus, LogOut, Palette, X, ArrowLeftRight, Building2, List, Columns2, LayoutGrid, ChevronDown, Trophy, FileText, Download, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { filterNavItems, filterAdminItems } from '@/components/layout/nav-items';
import type { AlertCounts, ClubInfo, SidebarList } from '@/components/layout/AppShell';

/* ───────────── Component ───────────── */

export function MobileDrawer({
  open,
  onOpenChange,
  alertCounts,
  userRole,
  clubInfo,
  isSuperadmin,
  canViewCompetitions = false,
  isDemo = false,
  sidebarLists = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alertCounts: AlertCounts;
  userRole: string;
  clubInfo: ClubInfo | null;
  isSuperadmin: boolean;
  canViewCompetitions?: boolean;
  isDemo?: boolean;
  sidebarLists?: SidebarList[];
}) {
  const pathname = usePathname();
  const [listsExpanded, setListsExpanded] = useState(true);
  const [sharedListsExpanded, setSharedListsExpanded] = useState(true);

  const ownLists = sidebarLists.filter(l => !l.isSharedWithMe);
  const sharedLists = sidebarLists.filter(l => l.isSharedWithMe);

  const isScout = userRole === 'scout';
  const isRecruiter = userRole === 'recruiter';
  const features = clubInfo?.features ?? {};

  const visibleItems = filterNavItems(userRole, features);
  const visibleAdminItems = filterAdminItems(features);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  /* Lock body scroll when drawer is open */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  return (
    <>
      {/* Overlay — always in DOM, fades in/out */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/50 transition-opacity duration-250 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer panel — always in DOM, slides in/out */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card shadow-xl transition-transform duration-250 ease-out lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal={open}
        aria-label="Menu de navegação"
      >
        {/* Header — club name + close */}
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div className="flex items-center gap-2 min-w-0">
            {clubInfo?.logoUrl ? (
              <Image src={clubInfo.logoUrl} alt="" width={28} height={28} className="rounded shrink-0" />
            ) : (
              <Image src="/logo-icon.svg" alt="" width={28} height={28} className="dark:invert shrink-0" />
            )}
            <span className="text-xl font-bold tracking-tight truncate">
              {clubInfo?.name ?? 'Eskout'}
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
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
                    onClick={close}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
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
                  {/* Sub-item: Feedback Treinos — under Abordagens, admin/editor only */}
                  {item.href === '/pipeline' && (userRole === 'admin' || userRole === 'editor') && (
                    <Link
                      href="/definicoes/feedback-treinos"
                      onClick={close}
                      className={cn(
                        'mt-0.5 flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] font-medium transition-colors',
                        pathname.startsWith('/definicoes/feedback-treinos')
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <ClipboardList className="h-4 w-4" />
                      Feedback Treinos
                      {alertCounts.newFeedbacks > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[10px] font-bold text-white">
                          {alertCounts.newFeedbacks}
                        </span>
                      )}
                    </Link>
                  )}
                  {/* Sub-item: Adicionados (pending players) — under Jogadores, admin/editor only */}
                  {item.href === '/' && !isScout && !isRecruiter && (userRole === 'admin' || userRole === 'editor') && (
                    <Link
                      href="/admin/pendentes"
                      onClick={close}
                      className={cn(
                        'mt-0.5 flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] font-medium transition-colors',
                        pathname.startsWith('/admin/pendentes')
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <UserPlus className="h-4 w-4" />
                      Adicionados
                      {alertCounts.pendingPlayers > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {alertCounts.pendingPlayers}
                        </span>
                      )}
                    </Link>
                  )}
                  {/* Sub-item: Listas (collapsible) — under Jogadores, all roles */}
                  {item.href === '/' && (
                    <div className="mt-0.5">
                      <div className="flex items-center">
                        <Link
                          href="/listas"
                          onClick={close}
                          className={cn(
                            'flex flex-1 items-center gap-2.5 rounded-md py-2 pl-11 pr-1 text-[13px] font-medium transition-colors',
                            pathname === '/listas'
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          <List className="h-4 w-4" />
                          Listas
                        </Link>
                        {ownLists.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setListsExpanded((v) => !v)}
                            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                            aria-label={listsExpanded ? 'Recolher listas' : 'Expandir listas'}
                          >
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !listsExpanded && '-rotate-90')} />
                          </button>
                        )}
                      </div>
                      {/* Own list sub-items */}
                      {listsExpanded && ownLists.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {ownLists.map((list) => (
                            <Link
                              key={list.id}
                              href={`/listas/${list.id}`}
                              onClick={close}
                              className={cn(
                                'flex items-center gap-2 rounded-md py-1.5 pl-[3.75rem] pr-3 text-[12px] font-medium transition-colors',
                                pathname === `/listas/${list.id}`
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground/50 hover:bg-accent hover:text-accent-foreground'
                              )}
                            >
                              <span className="text-[12px] leading-none">{list.emoji}</span>
                              <span className="truncate">{list.name}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {/* Shared lists — collapsible group */}
                      {sharedLists.length > 0 && (
                        <>
                          <div className="flex items-center mt-1">
                            <span className="pl-11 text-[11px] font-medium text-muted-foreground/40 uppercase tracking-wider flex-1">Partilhadas</span>
                            <button
                              type="button"
                              onClick={() => setSharedListsExpanded((v) => !v)}
                              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                              aria-label={sharedListsExpanded ? 'Recolher partilhadas' : 'Expandir partilhadas'}
                            >
                              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !sharedListsExpanded && '-rotate-90')} />
                            </button>
                          </div>
                          {sharedListsExpanded && (
                            <div className="mt-0.5 space-y-0.5">
                              {sharedLists.map((list) => (
                                <Link
                                  key={list.id}
                                  href={`/listas/${list.id}`}
                                  onClick={close}
                                  className={cn(
                                    'flex items-center gap-2 rounded-md py-1.5 pl-[3.75rem] pr-3 text-[12px] font-medium transition-colors',
                                    pathname === `/listas/${list.id}`
                                      ? 'bg-primary text-primary-foreground'
                                      : 'text-muted-foreground/50 hover:bg-accent hover:text-accent-foreground'
                                  )}
                                >
                                  <span className="text-[12px] leading-none">{list.emoji}</span>
                                  <span className="truncate">{list.name}</span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {/* Sub-item: Meus Relatórios — under Observações */}
                  {item.href === '/observacoes' && (
                    <Link
                      href="/avaliacoes"
                      onClick={close}
                      className={cn(
                        'mt-0.5 flex items-center gap-2.5 rounded-md py-1.5 pl-10 pr-3 text-[13px] font-medium transition-colors',
                        pathname.startsWith('/avaliacoes')
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Avaliações
                    </Link>
                  )}
                  {/* Sub-item: Comparar — under Jogadores, admin/editor/recruiter */}
                  {item.href === '/' && !isScout && (
                    <Link
                      href="/comparar"
                      onClick={close}
                      className={cn(
                        'mt-0.5 flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] font-medium transition-colors',
                        pathname.startsWith('/comparar')
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Columns2 className="h-4 w-4" />
                      Comparar
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Admin section */}
          {userRole === 'admin' && (
            <div className="mt-6">
              <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">Admin</p>
              <ul className="mt-2 space-y-1">
                {visibleAdminItems.map((item) => {
                  const Icon = item.icon;
                  // Exact match for /definicoes and /admin/dados to avoid highlighting when sub-pages are active
                  const isActive = item.href === '/definicoes'
                    ? pathname === '/definicoes'
                    : item.href === '/admin/dados'
                    ? pathname === '/admin/dados'
                    : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={close}
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
                      {/* Sub-items under Clube */}
                      {item.href === '/definicoes' && (
                        <>
                          <Link
                            href="/definicoes/planteis"
                            onClick={close}
                            className={cn(
                              'mt-0.5 flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] font-medium transition-colors',
                              pathname.startsWith('/definicoes/planteis')
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            <LayoutGrid className="h-4 w-4" />
                            Plantéis
                          </Link>
                          {features.scouting_reports !== false && (
                            <Link
                              href="/admin/relatorios"
                              onClick={close}
                              className={cn(
                                'mt-0.5 flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] font-medium transition-colors',
                                pathname.startsWith('/admin/relatorios')
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                              )}
                            >
                              <FileText className="h-4 w-4" />
                              Relatórios
                              {alertCounts.pendingReports > 0 && (
                                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                                  {alertCounts.pendingReports}
                                </span>
                              )}
                            </Link>
                          )}
                        </>
                      )}
                      {/* Sub-items under Dados */}
                      {item.href === '/admin/dados' && (
                        <>
                          <Link
                            href="/admin/dados/qualidade"
                            onClick={close}
                            className={cn(
                              'mt-0.5 flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] font-medium transition-colors',
                              pathname.startsWith('/admin/dados/qualidade')
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            <ArrowLeftRight className="h-4 w-4" />
                            Qualidade
                          </Link>
                          <Link
                            href="/admin/dados/importar"
                            onClick={close}
                            className={cn(
                              'mt-0.5 flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] font-medium transition-colors',
                              pathname.startsWith('/admin/dados/importar')
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            <Building2 className="h-4 w-4" />
                            Importar Clubes
                          </Link>
                          {features.export !== false && (
                            <Link
                              href="/exportar"
                              onClick={close}
                              className={cn(
                                'mt-0.5 flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] font-medium transition-colors',
                                pathname.startsWith('/exportar')
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'
                              )}
                            >
                              <Download className="h-4 w-4" />
                              Exportar
                            </Link>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

        </nav>

        {/* Footer */}
        <div className="border-t px-3 py-3 space-y-1">
          {/* Competitions link — superadmins and delegated users */}
          {(isSuperadmin || canViewCompetitions) && (
            <Link
              href="/master/competicoes"
              onClick={close}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                pathname.startsWith('/master/competicoes')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Trophy className="h-5 w-5" />
              Competições FPF
            </Link>
          )}
          {isSuperadmin && (
            <Link
              href="/master"
              onClick={close}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                pathname.startsWith('/master')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Building2 className="h-5 w-5" />
              Gestão Admin Eskout
            </Link>
          )}
          <Link
            href="/escolher-clube"
            onClick={close}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ArrowLeftRight className="h-5 w-5" />
            Trocar Clube
          </Link>
          <Link
            href="/preferencias"
            onClick={close}
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
          <form action={logout}>
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" type="submit">
              <LogOut className="h-5 w-5" />
              {isDemo ? 'Sair da Demo' : 'Sair'}
            </Button>
          </form>
        </div>
      </aside>
    </>
  );
}
