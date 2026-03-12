// src/app/admin/dados/DataQualityClient.tsx
// Client component for the data quality page — tabs, search, player list
// Shows players with data gaps or inconsistencies, grouped by issue type
// RELEVANT FILES: src/actions/data-quality.ts, src/app/admin/dados/page.tsx, src/lib/utils.ts

'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, X, ExternalLink, AlertTriangle, Camera, Globe, FileSearch,
  MapPin, Calendar, Flag, Footprints, Building2, Clock, Copy,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fuzzyMatch } from '@/lib/utils';
import { RefreshPlayerButton } from '@/components/players/RefreshPlayerButton';
import type { RefreshablePlayer } from '@/components/players/RefreshPlayerButton';
import type { DataGapPlayer, DataQualityTotals } from '@/actions/data-quality';

/* ───────────── Tab Types ───────────── */

type Tab =
  | 'missing_fpf' | 'missing_zz' | 'missing_both' | 'missing_photo'
  | 'missing_position' | 'missing_dob' | 'missing_nationality' | 'missing_foot'
  | 'fpf_club_mismatch' | 'stale_data' | 'duplicates';

/** Tab definition with count key into totals */
interface TabDef {
  value: Tab;
  label: string;
  icon: typeof AlertTriangle;
  description: string;
  totalKey: keyof DataQualityTotals;
  group: 'links' | 'profile' | 'integrity';
}

const TAB_GROUPS = [
  { key: 'links' as const, label: 'Links & Media' },
  { key: 'profile' as const, label: 'Dados do Perfil' },
  { key: 'integrity' as const, label: 'Integridade' },
];

const TABS: TabDef[] = [
  // Links & Media
  { value: 'missing_both', label: 'Sem FPF e ZZ', icon: AlertTriangle, description: 'Sem link FPF nem ZeroZero', totalKey: 'missingBoth', group: 'links' },
  { value: 'missing_fpf', label: 'Sem FPF', icon: Globe, description: 'Sem link FPF', totalKey: 'missingFpf', group: 'links' },
  { value: 'missing_zz', label: 'Sem ZeroZero', icon: FileSearch, description: 'Sem link ZeroZero', totalKey: 'missingZz', group: 'links' },
  { value: 'missing_photo', label: 'Sem Foto', icon: Camera, description: 'Sem foto (nem manual nem ZZ)', totalKey: 'missingPhoto', group: 'links' },
  // Profile
  { value: 'missing_position', label: 'Sem Posição', icon: MapPin, description: 'Posição não definida', totalKey: 'missingPosition', group: 'profile' },
  { value: 'missing_dob', label: 'Sem Nascimento', icon: Calendar, description: 'Sem data de nascimento', totalKey: 'missingDob', group: 'profile' },
  { value: 'missing_nationality', label: 'Sem Nacionalidade', icon: Flag, description: 'Nacionalidade não preenchida', totalKey: 'missingNationality', group: 'profile' },
  { value: 'missing_foot', label: 'Sem Pé', icon: Footprints, description: 'Pé preferido não definido', totalKey: 'missingFoot', group: 'profile' },
  // Integrity
  { value: 'fpf_club_mismatch', label: 'Clube Errado', icon: Building2, description: 'Clube FPF diferente do sistema', totalKey: 'fpfClubMismatch', group: 'integrity' },
  { value: 'stale_data', label: 'Desatualizados', icon: Clock, description: 'Dados FPF/ZZ com +1 ano', totalKey: 'staleData', group: 'integrity' },
  { value: 'duplicates', label: 'Duplicados', icon: Copy, description: 'Mesmo nome + data nascimento', totalKey: 'duplicates', group: 'integrity' },
];

/* ───────────── Component ───────────── */

interface Props {
  players: DataGapPlayer[];
  totals: DataQualityTotals;
}

export function DataQualityClient({ players, totals }: Props) {
  const [search, setSearch] = useState('');
  // Track players that were updated inline — hide them from the list without full reload
  const [updatedIds, setUpdatedIds] = useState<Set<number>>(new Set());
  const markUpdated = useCallback((id: number) => {
    setUpdatedIds((prev) => new Set(prev).add(id));
  }, []);

  // Only show tabs that have players — hide empty categories
  const visibleTabs = useMemo(
    () => TABS.filter((t) => totals[t.totalKey] > 0),
    [totals],
  );
  const [tab, setTab] = useState<Tab>(() => visibleTabs[0]?.value ?? 'missing_both');

  // Filter players by selected tab
  const tabPlayers = useMemo(() => {
    switch (tab) {
      case 'missing_fpf': return players.filter((p) => !p.hasFpf);
      case 'missing_zz': return players.filter((p) => !p.hasZz);
      case 'missing_both': return players.filter((p) => !p.hasFpf && !p.hasZz);
      case 'missing_photo': return players.filter((p) => !p.hasPhoto);
      case 'missing_position': return players.filter((p) => !p.hasPosition);
      case 'missing_dob': return players.filter((p) => !p.hasDob);
      case 'missing_nationality': return players.filter((p) => !p.hasNationality);
      case 'missing_foot': return players.filter((p) => !p.hasFoot);
      case 'fpf_club_mismatch': return players.filter((p) => p.fpfClubMismatch);
      case 'stale_data': return players.filter((p) => p.staleData);
      case 'duplicates': return players.filter((p) => p.duplicateKey);
    }
  }, [players, tab]);

  // Apply search + hide updated players
  const filtered = useMemo(() => {
    let list = tabPlayers.filter((p) => !updatedIds.has(p.id));
    if (search.trim()) {
      list = list.filter((p) =>
        fuzzyMatch(`${p.name} ${p.club} ${p.positionNormalized}`, search),
      );
    }
    return list;
  }, [tabPlayers, search, updatedIds]);

  // Active tab definition (for context-specific column in player rows)
  const activeTab = TABS.find((t) => t.value === tab);

  return (
    <div>
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard label="Total jogadores" value={totals.total} />
        {totals.missingBoth > 0 && <SummaryCard label="Sem FPF e ZZ" value={totals.missingBoth} pct={totals.total} warn />}
        {totals.missingPhoto > 0 && <SummaryCard label="Sem foto" value={totals.missingPhoto} pct={totals.total} warn />}
        {totals.fpfClubMismatch > 0 && <SummaryCard label="Clube errado" value={totals.fpfClubMismatch} pct={totals.total} warn />}
        {totals.staleData > 0 && <SummaryCard label="Desatualizados" value={totals.staleData} pct={totals.total} warn />}
        {totals.duplicates > 0 && <SummaryCard label="Duplicados" value={totals.duplicates} pct={totals.total} warn />}
      </div>

      {/* All complete placeholder */}
      {visibleTabs.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-green-300 bg-green-50 py-10 dark:border-green-800 dark:bg-green-950/30">
          <span className="text-2xl">✅</span>
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Tudo preenchido!
          </p>
          <p className="max-w-xs text-center text-xs text-green-600/80 dark:text-green-500/80">
            Todos os jogadores têm dados completos. Sem lacunas, inconsistências ou duplicados.
          </p>
        </div>
      )}

      {/* Tabs grouped by category */}
      {visibleTabs.length > 0 && (
        <div className="mb-3 space-y-2">
          {TAB_GROUPS.map((group) => {
            const groupTabs = visibleTabs.filter((t) => t.group === group.key);
            if (groupTabs.length === 0) return null;
            return (
              <div key={group.key}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {groupTabs.map((t) => {
                    const count = totals[t.totalKey];
                    const active = tab === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setTab(t.value)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          active
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted'
                        }`}
                        title={t.description}
                      >
                        <t.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="whitespace-nowrap">{t.label}</span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                          active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
        <Input
          placeholder="Pesquisar nome, clube ou posição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-9 pr-8 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/50 hover:text-foreground"
            aria-label="Limpar pesquisa"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Count */}
      <p className="mb-2 text-xs text-muted-foreground">
        {filtered.length} jogador{filtered.length !== 1 ? 'es' : ''}
      </p>

      {/* Player list */}
      <div className="space-y-1">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search ? 'Nenhum resultado.' : 'Todos os jogadores têm estes dados preenchidos.'}
          </p>
        )}
        {filtered.map((player) => (
          <PlayerRow key={player.id} player={player} activeTab={activeTab?.value} onUpdated={markUpdated} />
        ))}
      </div>
    </div>
  );
}

/* ───────────── Summary Card ───────────── */

function SummaryCard({ label, value, pct, warn }: { label: string; value: number; pct?: number; warn?: boolean }) {
  const percentage = pct && pct > 0 ? Math.round((value / pct) * 100) : null;
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${warn && value > 0 ? 'text-amber-600' : ''}`}>
        {value}
        {percentage !== null && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">({percentage}%)</span>
        )}
      </p>
    </div>
  );
}

/* ───────────── Player Row ───────────── */

/** Show inline refresh on all tabs except duplicates (scraping won't fix duplicates) */
function canRefreshInline(tab?: Tab): boolean {
  return !!tab && tab !== 'duplicates';
}

/** Build a RefreshablePlayer from DataGapPlayer — only the fields the scraper dialog needs */
function toRefreshable(p: DataGapPlayer): RefreshablePlayer {
  return {
    id: p.id,
    name: p.name,
    dob: p.dob,
    club: p.club,
    fpfLink: p.fpfLink ?? '',
    zerozeroLink: p.zerozeroLink ?? '',
    photoUrl: p.photoUrl ?? null,
    zzPhotoUrl: p.zzPhotoUrl ?? null,
    clubLogoUrl: null,
    positionNormalized: p.positionNormalized,
    secondaryPosition: null,
    tertiaryPosition: null,
    foot: p.foot ?? '',
    height: null,
    weight: null,
    birthCountry: null,
    nationality: p.nationality ?? null,
  };
}

function PlayerRow({ player, activeTab, onUpdated }: { player: DataGapPlayer; activeTab?: Tab; onUpdated: (id: number) => void }) {
  const birthYear = player.dob ? new Date(player.dob).getFullYear() : null;
  const showRefresh = canRefreshInline(activeTab) && (player.fpfLink || player.zerozeroLink);

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      {/* Status dots — show contextual dots based on active tab */}
      <div className="flex shrink-0 gap-1">
        {isLinkTab(activeTab) && (
          <>
            <StatusDot ok={player.hasFpf} label="FPF" />
            <StatusDot ok={player.hasZz} label="ZZ" />
            <StatusDot ok={player.hasPhoto} label="Foto" />
          </>
        )}
        {activeTab === 'missing_position' && <StatusDot ok={player.hasPosition} label="Pos" />}
        {activeTab === 'missing_dob' && <StatusDot ok={player.hasDob} label="Nasc" />}
        {activeTab === 'missing_nationality' && <StatusDot ok={player.hasNationality} label="Nac" />}
        {activeTab === 'missing_foot' && <StatusDot ok={player.hasFoot} label="Pé" />}
        {activeTab === 'fpf_club_mismatch' && <MismatchBadge player={player} />}
        {activeTab === 'stale_data' && (
          <>
            {player.staleFpf && <StatusDot ok={false} label="FPF" />}
            {player.staleZz && <StatusDot ok={false} label="ZZ" />}
          </>
        )}
        {activeTab === 'duplicates' && <StatusDot ok={false} label="Dup" />}
      </div>

      {/* Player info */}
      <div className="min-w-0 flex-1">
        <Link
          href={`/jogadores/${player.id}`}
          className="truncate text-sm font-medium hover:underline"
        >
          {player.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {player.club}
          {player.positionNormalized ? ` · ${player.positionNormalized}` : ''}
          {birthYear ? ` · ${birthYear}` : ''}
        </p>
      </div>

      {/* Inline refresh button — for stale/mismatch tabs */}
      {showRefresh && (
        <RefreshPlayerButton
          player={toRefreshable(player)}
          compact
          onUpdated={() => onUpdated(player.id)}
        />
      )}

      {/* Quick edit link */}
      <Link
        href={`/jogadores/${player.id}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Abrir perfil"
      >
        <ExternalLink className="h-4 w-4" />
      </Link>
    </div>
  );
}

/* ───────────── Mismatch Badge ───────────── */

/** Shows the FPF club vs system club mismatch */
function MismatchBadge({ player }: { player: DataGapPlayer }) {
  const isNoClub = !player.fpfCurrentClub || player.fpfCurrentClub === 'Sem Clube';
  const fpfLabel = isNoClub ? 'Sem Clube' : player.fpfCurrentClub;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 text-[9px] font-bold ${
        isNoClub
          ? 'bg-red-100 text-red-600'
          : 'bg-amber-100 text-amber-700'
      }`}
      title={`FPF: ${fpfLabel} · Sistema: ${player.club}`}
    >
      FPF: {fpfLabel}
    </span>
  );
}

/* ───────────── Status Dot ───────────── */

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded px-1 text-[9px] font-bold ${
        ok
          ? 'bg-green-100 text-green-700'
          : 'bg-red-100 text-red-600'
      }`}
      title={ok ? `${label} preenchido` : `${label} em falta`}
    >
      {label}
    </span>
  );
}

/* ───────────── Helpers ───────────── */

/** Check if the active tab is a link/media tab (shows FPF/ZZ/Foto dots) */
function isLinkTab(tab?: Tab): boolean {
  return tab === 'missing_fpf' || tab === 'missing_zz' || tab === 'missing_both' || tab === 'missing_photo' || !tab;
}
