// src/components/common/OpinionBadge.tsx
// Colored badge component for department opinion values — supports single or array
// Maps each opinion to its corresponding status color per brand guidelines
// RELEVANT FILES: src/lib/constants.ts, src/lib/types/index.ts, src/components/players/PlayerCard.tsx

import { cn } from '@/lib/utils';
import { OPINION_COLOR_MAP } from '@/lib/constants';
import type { DepartmentOpinion } from '@/lib/types';

interface OpinionBadgeProps {
  /** Accepts a single opinion, an array of opinions, or empty/null */
  opinion: DepartmentOpinion | DepartmentOpinion[] | '' | null;
  className?: string;
}

export function OpinionBadge({ opinion, className }: OpinionBadgeProps) {
  // Normalize to array
  const opinions: DepartmentOpinion[] = Array.isArray(opinion)
    ? opinion
    : opinion ? [opinion as DepartmentOpinion] : [];

  if (opinions.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {opinions.map((op) => {
        const colorClass = OPINION_COLOR_MAP[op] ?? 'bg-neutral-200 text-neutral-700';
        return (
          <span
            key={op}
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              colorClass,
              className
            )}
          >
            {op}
          </span>
        );
      })}
    </span>
  );
}
