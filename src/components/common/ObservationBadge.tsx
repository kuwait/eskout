// src/components/common/ObservationBadge.tsx
// Small icon badge showing the observation tier of a player (Observado / Referenciado / Adicionado)
// Computed from player data, not stored — uses getObservationTier() from constants
// RELEVANT FILES: src/lib/constants.ts, src/components/players/PlayerCard.tsx, src/components/players/PlayerTable.tsx

import { FileText, Eye, Plus } from 'lucide-react';
import { OBSERVATION_TIER_MAP, getObservationTier } from '@/lib/constants';
import type { Player } from '@/lib/types';

const TIER_ICONS = {
  observado: FileText,
  referenciado: Eye,
  adicionado: Plus,
} as const;

interface ObservationBadgeProps {
  player: Player;
  /** Show label text next to icon (default: false — icon only) */
  showLabel?: boolean;
}

export function ObservationBadge({ player, showLabel = false }: ObservationBadgeProps) {
  const tier = getObservationTier(player);
  const config = OBSERVATION_TIER_MAP[tier];
  const Icon = TIER_ICONS[tier];

  return (
    <span
      role="img"
      className={`inline-flex shrink-0 items-center gap-1 ${config.tailwind}`}
      title={config.tooltip}
      aria-label={`Estado de observação: ${config.labelPt}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {showLabel && <span className="hidden text-xs font-medium lg:inline">{config.labelPt}</span>}
    </span>
  );
}
