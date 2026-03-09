// src/components/squad/SquadCompareView.tsx
// Side-by-side comparison view — Real Squad vs Shadow Squad per position
// Each position row shows real players on the left, shadow candidates on the right
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/common/PlayerAvatar.tsx, src/lib/constants.ts

'use client';

import Image from 'next/image';
import { User } from 'lucide-react';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { SQUAD_SLOTS } from '@/lib/constants';
import type { Player } from '@/lib/types';

/* ───────────── Rank colors for shadow ───────────── */

const RANK_DOT: Record<number, string> = {
  0: 'bg-amber-400',
  1: 'bg-neutral-300',
  2: 'bg-amber-700',
};

/** First + last name */
function displayName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/* ───────────── Mini player card ───────────── */

function MiniCard({ player, rank, onPlayerClick }: { player: Player; rank?: number; onPlayerClick?: (id: number) => void }) {
  const photoUrl = player.photoUrl || player.zzPhotoUrl;
  const dobLabel = player.dob
    ? (() => { try { return new Date(player.dob!).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return player.dob; } })()
    : null;

  return (
    <div
      className="flex items-center gap-2 rounded-md border bg-white p-2 cursor-pointer transition-colors hover:bg-neutral-50"
      onClick={() => onPlayerClick?.(player.id)}
    >
      {/* Rank dot */}
      {rank !== undefined && (
        <div className="flex flex-col items-center gap-0.5">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ${RANK_DOT[rank] ?? 'bg-neutral-200 text-neutral-500'}`}>
            {rank + 1}
          </span>
        </div>
      )}

      {/* Photo */}
      {photoUrl ? (
        <Image src={photoUrl} alt="" width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
          <User className="h-4 w-4" />
        </span>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{displayName(player.name)}</p>
        <p className="truncate text-[10px] text-neutral-500">{player.club || '—'}</p>
        <div className="flex flex-wrap gap-x-2 text-[10px] text-neutral-400">
          {player.foot && <span>Pé: <span className="text-neutral-600">{player.foot}</span></span>}
          {dobLabel && <span>Nasc: <span className="text-neutral-600">{dobLabel}</span></span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-0.5">
          <OpinionBadge opinion={player.departmentOpinion} className="px-1 py-0 text-[8px]" />
          {player.recruitmentStatus && (
            <StatusBadge status={player.recruitmentStatus} className="px-1 py-0 text-[8px]" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Props ───────────── */

interface SquadCompareViewProps {
  realByPosition: Record<string, Player[]>;
  shadowByPosition: Record<string, Player[]>;
  onPlayerClick?: (playerId: number) => void;
}

/* ───────────── Component ───────────── */

export function SquadCompareView({ realByPosition, shadowByPosition, onPlayerClick }: SquadCompareViewProps) {
  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="hidden sm:grid sm:grid-cols-[100px_1fr_1fr] gap-3 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <div />
        <div className="text-center">Plantel Real</div>
        <div className="text-center">Plantel Sombra</div>
      </div>

      {SQUAD_SLOTS.map(({ slot, label }) => {
        const realPlayers = realByPosition[slot] ?? [];
        const shadowPlayers = shadowByPosition[slot] ?? [];

        return (
          <div key={slot} className="rounded-lg border bg-neutral-50/50 overflow-hidden">
            {/* Mobile: position header on top */}
            <div className="sm:hidden border-b bg-neutral-100 px-3 py-1.5 flex items-center gap-2">
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {slot}
              </span>
              <span className="text-xs font-semibold">{label}</span>
            </div>

            {/* Desktop: 3-column grid */}
            <div className="sm:grid sm:grid-cols-[100px_1fr_1fr] gap-2 p-2">
              {/* Position label — desktop only */}
              <div className="hidden sm:flex sm:flex-col sm:items-center sm:justify-center">
                <span className="rounded bg-neutral-800 px-2 py-1 text-xs font-bold text-white">
                  {slot}
                </span>
                <span className="mt-1 text-center text-[10px] text-muted-foreground">{label}</span>
              </div>

              {/* Real squad column */}
              <div className="space-y-1.5 p-1">
                {/* Mobile label */}
                <p className="sm:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Plantel Real</p>
                {realPlayers.length === 0 ? (
                  <div className="flex h-12 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                    Sem jogador
                  </div>
                ) : (
                  realPlayers.map((p) => (
                    <MiniCard key={p.id} player={p} onPlayerClick={onPlayerClick} />
                  ))
                )}
              </div>

              {/* Shadow squad column */}
              <div className="space-y-1.5 p-1">
                {/* Mobile label */}
                <p className="sm:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 mt-2">Plantel Sombra</p>
                {shadowPlayers.length === 0 ? (
                  <div className="flex h-12 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                    Sem candidatos
                  </div>
                ) : (
                  shadowPlayers.map((p, i) => (
                    <MiniCard key={p.id} player={p} rank={i} onPlayerClick={onPlayerClick} />
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
