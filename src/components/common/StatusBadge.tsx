// src/components/common/StatusBadge.tsx
// Colored badge component for recruitment pipeline status values
// Maps each status to its corresponding pipeline color per brand guidelines
// RELEVANT FILES: src/lib/constants.ts, src/lib/types/index.ts, src/components/players/PlayerProfile.tsx

import { cn } from '@/lib/utils';
import { RECRUITMENT_STATUS_MAP, RECRUITMENT_LABEL_MAP } from '@/lib/constants';
import type { RecruitmentStatus } from '@/lib/types';

interface StatusBadgeProps {
  status: RecruitmentStatus | string | null;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return null;

  const colorClass = RECRUITMENT_STATUS_MAP[status as RecruitmentStatus] ?? 'bg-neutral-200 text-neutral-700';
  const label = RECRUITMENT_LABEL_MAP[status as RecruitmentStatus] ?? status;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
