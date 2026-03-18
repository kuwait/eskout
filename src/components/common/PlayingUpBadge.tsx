// src/components/common/PlayingUpBadge.tsx
// Badge indicating a player competes above their natural age group
// Computed from ZZ team history + DOB — no extra queries needed
// RELEVANT FILES: src/lib/utils/playing-up.ts, src/components/common/ObservationBadge.tsx, src/components/players/PlayerProfile.tsx

import { ArrowUpRight } from 'lucide-react';
import { detectPlayingUp } from '@/lib/utils/playing-up';
import type { Player } from '@/lib/types';

interface PlayingUpBadgeProps {
  player: Player;
  /** Show full styled badge (default: false — compact icon for table/card) */
  showLabel?: boolean;
}

export function PlayingUpBadge({ player, showLabel = false }: PlayingUpBadgeProps) {
  const result = detectPlayingUp(player);
  if (!result.isPlayingUp) return null;

  const tooltip = `Natural Sub-${result.naturalAge}, compete em Sub-${result.teamAge} (+${result.yearsAbove})`;

  // Compact: small amber arrow icon for table/card rows
  if (!showLabel) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-amber-100 p-0.5 text-amber-600"
        title={tooltip}
        aria-label={`Joga acima: ${tooltip}`}
      >
        <ArrowUpRight className="h-3 w-3" />
      </span>
    );
  }

  // Full: styled pill badge for profile header
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700"
      title={tooltip}
      aria-label={`Joga acima: ${tooltip}`}
    >
      <ArrowUpRight className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold">Joga Acima</span>
      <span className="rounded-full bg-amber-200 px-1.5 py-px text-[10px] font-bold text-amber-800">+{result.yearsAbove}</span>
    </span>
  );
}
