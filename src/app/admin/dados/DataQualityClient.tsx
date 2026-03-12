// src/app/admin/dados/DataQualityClient.tsx
// Client component for the data quality page — tabs, search, player list
// Shows players missing FPF, ZeroZero, both, or photo with quick links
// RELEVANT FILES: src/actions/data-quality.ts, src/app/admin/dados/page.tsx, src/lib/utils.ts

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, ExternalLink, AlertTriangle, Camera, Globe, FileSearch } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fuzzyMatch } from '@/lib/utils';
import type { DataGapPlayer, DataQualityResult } from '@/actions/data-quality';

/* ───────────── Tab Types ───────────── */

type Tab = 'missing_fpf' | 'missing_zz' | 'missing_both' | 'missing_photo';

const TABS: { value: Tab; label: string; icon: typeof AlertTriangle; description: string }[] = [
  { value: 'missing_both', label: 'Sem FPF e ZZ', icon: AlertTriangle, description: 'Sem link FPF nem ZeroZero' },
  { value: 'missing_fpf', label: 'Sem FPF', icon: Globe, description: 'Sem link FPF' },
  { value: 'missing_zz', label: 'Sem ZeroZero', icon: FileSearch, description: 'Sem link ZeroZero' },
  { value: 'missing_photo', label: 'Sem Foto', icon: Camera, description: 'Sem foto (nem manual nem ZZ)' },
];

/* ───────────── Component ───────────── */

interface Props {
  players: DataGapPlayer[];
  totals: DataQualityResult['totals'];
}

export function DataQualityClient({ players, totals }: Props) {
  const [tab, setTab] = useState<Tab>('missing_both');
  const [search, setSearch] = useState('');

  // Filter players by selected tab
  const tabPlayers = useMemo(() => {
    switch (tab) {
      case 'missing_fpf': return players.filter((p) => !p.hasFpf);
      case 'missing_zz': return players.filter((p) => !p.hasZz);
      case 'missing_both': return players.filter((p) => !p.hasFpf && !p.hasZz);
      case 'missing_photo': return players.filter((p) => !p.hasPhoto);
    }
  }, [players, tab]);

  // Apply search
  const filtered = useMemo(() => {
    if (!search.trim()) return tabPlayers;
    return tabPlayers.filter((p) =>
      fuzzyMatch(`${p.name} ${p.club} ${p.positionNormalized}`, search)
    );
  }, [tabPlayers, search]);

  // Tab count
  function tabCount(t: Tab): number {
    switch (t) {
      case 'missing_fpf': return totals.missingFpf;
      case 'missing_zz': return totals.missingZz;
      case 'missing_both': return totals.missingBoth;
      case 'missing_photo': return totals.missingPhoto;
    }
  }

  return (
    <div>
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard label="Total jogadores" value={totals.total} />
        <SummaryCard label="Sem FPF" value={totals.missingFpf} pct={totals.total} warn />
        <SummaryCard label="Sem ZeroZero" value={totals.missingZz} pct={totals.total} warn />
        <SummaryCard label="Sem foto" value={totals.missingPhoto} pct={totals.total} warn />
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const count = tabCount(t.value);
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

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
          <PlayerRow key={player.id} player={player} />
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

function PlayerRow({ player }: { player: DataGapPlayer }) {
  const birthYear = player.dob ? new Date(player.dob).getFullYear() : null;

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      {/* Status dots */}
      <div className="flex shrink-0 gap-1">
        <StatusDot ok={player.hasFpf} label="FPF" />
        <StatusDot ok={player.hasZz} label="ZZ" />
        <StatusDot ok={player.hasPhoto} label="Foto" />
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
