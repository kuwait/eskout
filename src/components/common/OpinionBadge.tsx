// src/components/common/OpinionBadge.tsx
// Colored badge component for department opinion values
// Maps each opinion to its corresponding status color per brand guidelines
// RELEVANT FILES: src/lib/constants.ts, src/lib/types/index.ts, src/components/players/PlayerCard.tsx

import { cn } from '@/lib/utils';
import { OPINION_COLOR_MAP } from '@/lib/constants';
import type { DepartmentOpinion } from '@/lib/types';

interface OpinionBadgeProps {
  opinion: DepartmentOpinion | '' | null;
  className?: string;
}

export function OpinionBadge({ opinion, className }: OpinionBadgeProps) {
  if (!opinion) return null;

  const colorClass = OPINION_COLOR_MAP[opinion as DepartmentOpinion] ?? 'bg-neutral-200 text-neutral-700';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
        className
      )}
    >
      {opinion}
    </span>
  );
}
