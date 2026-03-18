// src/components/common/PlayingUpBadge.tsx
// Badge indicating a player competes above their natural age group
// Uses pre-computed playingUpRegular/playingUpPontual fields from Player (set by mapper + FPF enrichment)
// RELEVANT FILES: src/lib/utils/playing-up.ts, src/actions/players.ts, src/components/players/PlayerProfile.tsx

import { Flame } from 'lucide-react';
import type { PlayingUpResult } from '@/lib/utils/playing-up';
import type { Player } from '@/lib/types';

interface FpfPlayingUpEntry {
  competitionEscalao: string;
  games: number;
  goals: number;
  minutes: number;
}

interface PlayingUpBadgeProps {
  player: Player;
  /** Show full styled card (default: false — compact icon for table/card) */
  showLabel?: boolean;
  /** FPF playing-up entries (server-fetched, only in profile) */
  fpfEntries?: FpfPlayingUpEntry[];
  /** Pre-computed ZZ result from server (avoids hydration mismatch in profile) */
  zzResult?: PlayingUpResult;
}

export function PlayingUpBadge({ player, showLabel = false, fpfEntries = [], zzResult }: PlayingUpBadgeProps) {
  // For compact views (table/cards): use pre-computed fields on Player object
  const isRegular = player.playingUpRegular === true;
  const isPontual = player.playingUpPontual === true;
  const hasFpf = fpfEntries.length > 0;

  // For profile (showLabel): also check zzResult and fpfEntries
  const zzUp = zzResult?.isPlayingUp === true;
  const anyPlayingUp = isRegular || isPontual || zzUp || hasFpf;

  if (!anyPlayingUp) return null;

  // Determine regularity: prefer pre-computed, fall back to zzResult
  const regular = isRegular || (zzUp && zzResult.regular) || (hasFpf && !isPontual);
  const label = regular ? 'Joga Acima' : 'Já jogou acima';

  const naturalAge = zzUp ? zzResult.naturalAge : null;
  const teamAge = zzUp ? zzResult.teamAge : null;

  // Tooltip
  const parts: string[] = [];
  if (zzUp) parts.push(`Natural Sub-${naturalAge}, compete em Sub-${teamAge}`);
  if (hasFpf) {
    const total = fpfEntries.reduce((s, e) => s + e.games, 0);
    parts.push(`${total} jogos FPF acima do escalão`);
  }
  const tooltip = parts.length > 0 ? parts.join(' · ') : label;

  // Compact: fire icon for table/card rows
  if (!showLabel) {
    return (
      <span
        className="inline-flex shrink-0 text-orange-500"
        title={tooltip}
        aria-label={`${label}: ${tooltip}`}
      >
        <Flame className="h-3.5 w-3.5" fill="currentColor" />
      </span>
    );
  }

  // Full: card with left accent border — matches app style
  const borderColor = regular ? 'border-l-orange-500' : 'border-l-amber-400';
  const bgColor = regular ? 'bg-orange-50/60 border-orange-200' : 'bg-amber-50/40 border-amber-200';
  const textColor = regular ? 'text-orange-700' : 'text-amber-700';
  const iconColor = regular ? 'text-orange-500' : 'text-amber-500';
  const subTextColor = regular ? 'text-orange-600/70' : 'text-amber-600/60';

  return (
    <div
      className={`inline-flex flex-col rounded-lg border border-l-[3px] ${borderColor} ${bgColor} px-3 py-2`}
      title={tooltip}
      aria-label={`${label}: ${tooltip}`}
    >
      <div className="flex items-center gap-2">
        <Flame className={`h-4 w-4 shrink-0 ${iconColor}`} fill="currentColor" />
        <span className={`text-sm font-bold ${textColor}`}>{label}</span>
        {teamAge && (
          <span className={`text-sm ${subTextColor}`}>— Sub-{teamAge}</span>
        )}
      </div>
      {naturalAge && (
        <p className={`mt-0.5 pl-6 text-xs ${subTextColor}`}>
          Escalão natural: <span className={`font-semibold ${textColor}`}>Sub-{naturalAge}</span>
        </p>
      )}
    </div>
  );
}
