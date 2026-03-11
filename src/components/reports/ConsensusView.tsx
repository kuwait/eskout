// src/components/reports/ConsensusView.tsx
// Multi-scout divergence view — compact cards showing scout disagreements at a glance
// Each scout = colored dot + name + decision inline. Clashing colors = instant signal.
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/admin/relatorios/consenso/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Users } from 'lucide-react';
import { ClubBadge } from '@/components/common/ClubBadge';
import type { ConsensusEntry } from '@/actions/scout-reports';

/* ───────────── Design Tokens ───────────── */

const DOT_COLORS: Record<number, string> = {
  1: 'bg-red-500', 2: 'bg-orange-400', 3: 'bg-blue-500', 4: 'bg-emerald-500', 5: 'bg-emerald-600',
};

const ROW_BG: Record<number, string> = {
  1: 'bg-red-50', 2: 'bg-orange-50', 3: 'bg-blue-50', 4: 'bg-emerald-50', 5: 'bg-emerald-50/80',
};

const ROW_TEXT: Record<number, string> = {
  1: 'text-red-700', 2: 'text-orange-700', 3: 'text-blue-700', 4: 'text-emerald-700', 5: 'text-emerald-800',
};

/* ───────────── Dismiss (localStorage, resurfaces on new data) ───────────── */

const STORAGE_KEY = 'eskout_dismissed_consensus';
const MAX_VISIBLE = 18;

type DismissedMap = Record<string, number>;

function loadDismissed(): DismissedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveDismissed(map: DismissedMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function eKey(e: ConsensusEntry): string {
  return e.playerName.toLowerCase().trim();
}

function isEntryDismissed(map: DismissedMap, entry: ConsensusEntry): boolean {
  const k = eKey(entry);
  return k in map && map[k] === entry.reportCount;
}

/* ───────────── Main ───────────── */

export function ConsensusView({ entries }: { entries: ConsensusEntry[] }) {
  const [dMap, setDMap] = useState<DismissedMap>({});

  /* eslint-disable react-hooks/set-state-in-effect -- loads dismissed state from localStorage after SSR */
  useEffect(() => { setDMap(loadDismissed()); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const nonAligned = entries.filter((e) => e.agreementScore < 80);
  const active = nonAligned.filter((e) => !isEntryDismissed(dMap, e));
  const dismissedCount = nonAligned.length - active.length;
  const visible = active.slice(0, MAX_VISIBLE);
  const overflow = active.length - visible.length;

  function dismiss(entry: ConsensusEntry) {
    const next = { ...dMap, [eKey(entry)]: entry.reportCount };
    setDMap(next);
    saveDismissed(next);
  }

  function restoreAll() {
    setDMap({});
    saveDismissed({});
  }

  /* Empty state */
  if (nonAligned.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-20 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <Users className="h-6 w-6 text-emerald-500" />
        </div>
        <p className="text-sm font-medium">Sem divergências</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {entries.length > 0 ? 'Scouts alinhados em todos os jogadores.' : 'Aparece aqui quando 2+ scouts avaliarem o mesmo jogador.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {active.length} divergência{active.length !== 1 ? 's' : ''}
        </p>
        {dismissedCount > 0 && (
          <button onClick={restoreAll} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-neutral-700">
            <RotateCcw className="h-3 w-3" />
            Restaurar {dismissedCount}
          </button>
        )}
      </div>

      {/* All analyzed */}
      {visible.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Tudo analisado.</p>
          {dismissedCount > 0 && (
            <button onClick={restoreAll} className="mt-2 text-xs text-blue-500 hover:underline">
              Restaurar todos
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="columns-1 gap-2 space-y-2 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
            {visible.map((entry) => (
              <DivergenceCard key={eKey(entry)} entry={entry} onDismiss={() => dismiss(entry)} />
            ))}
          </div>
          {overflow > 0 && (
            <p className="text-center text-[11px] text-muted-foreground">
              +{overflow} menos graves
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────── Divergence Card ───────────── */

/** Left border color by severity — worse = more red */
function severityBorder(score: number): string {
  if (score <= 20) return 'border-l-red-400';
  if (score <= 35) return 'border-l-red-300';
  if (score <= 50) return 'border-l-orange-300';
  return 'border-l-amber-300';
}

/** Severity label + color for the badge */
function severityBadge(score: number): { label: string; bg: string; text: string } {
  if (score <= 20) return { label: 'Crítico', bg: 'bg-red-500', text: 'text-white' };
  if (score <= 35) return { label: 'Grave', bg: 'bg-red-100', text: 'text-red-700' };
  if (score <= 50) return { label: 'Moderado', bg: 'bg-orange-100', text: 'text-orange-700' };
  return { label: 'Ligeiro', bg: 'bg-amber-100', text: 'text-amber-700' };
}

function DivergenceCard({ entry, onDismiss }: { entry: ConsensusEntry; onDismiss: () => void }) {
  const router = useRouter();
  const border = severityBorder(entry.agreementScore);
  const badge = severityBadge(entry.agreementScore);

  return (
    <div
      onClick={() => entry.playerId && router.push(`/jogadores/${entry.playerId}`)}
      className={`group overflow-hidden rounded-lg border border-l-[3px] ${border} bg-white transition-all hover:shadow-md break-inside-avoid ${
        entry.playerId ? 'cursor-pointer' : ''
      }`}
    >
      {/* Header — name + reason + dismiss */}
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-bold">{entry.playerName}</h3>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          </div>
          {(entry.playerClub || entry.position) && (
            <div className="flex items-center gap-1.5">
              {entry.position && (
                <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                  {entry.position}
                </span>
              )}
              {entry.playerClub && (
                <ClubBadge club={entry.playerClub} logoUrl={entry.playerClubLogoUrl} size="sm-md" className="text-muted-foreground/70" linkToFilter />
              )}
            </div>
          )}
          {entry.divergenceReasons.length > 0 && (
            <p className="text-[11px] text-red-500">
              {entry.divergenceReasons.map((r) => {
                const [label, values] = r.split(': ');
                return (
                  <span key={r}>
                    <span className="text-neutral-400">{label}: </span>
                    <span className="font-semibold">{values}</span>
                  </span>
                );
              }).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} className="text-neutral-300"> · </span>, el], [])}
            </p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          title="Analisado"
          className="mt-0.5 shrink-0 rounded-full p-0.5 text-neutral-300 transition-colors hover:bg-emerald-50 hover:text-emerald-500 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scout rows — one per scout, colored by their rating */}
      <div className="space-y-px pb-px">
        {entry.scouts.map((scout) => {
          const bg = scout.rating ? (ROW_BG[scout.rating] ?? 'bg-neutral-50') : 'bg-neutral-50';
          const text = scout.rating ? (ROW_TEXT[scout.rating] ?? 'text-neutral-500') : 'text-neutral-500';
          const dot = scout.rating ? (DOT_COLORS[scout.rating] ?? 'bg-neutral-400') : 'bg-neutral-300';

          return (
            <div key={scout.name} className={`flex items-center gap-2 px-3 py-1.5 ${bg}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${dot}`}>
                {scout.rating ?? '?'}
              </span>
              <span className={`min-w-0 flex-1 truncate text-xs font-medium ${text}`}>
                {scout.name}
              </span>
              {scout.decision && (
                <span className={`shrink-0 text-[10px] ${text} opacity-70`}>
                  {scout.decision}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
