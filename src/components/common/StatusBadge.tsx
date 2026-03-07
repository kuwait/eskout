// src/components/common/StatusBadge.tsx
// Colored badge component for recruitment pipeline status values
// Maps each status to its corresponding pipeline color per brand guidelines
// RELEVANT FILES: src/lib/constants.ts, src/lib/types/index.ts, src/components/players/PlayerProfile.tsx

import { cn } from '@/lib/utils';
import { RECRUITMENT_STATUS_MAP, RECRUITMENT_LABEL_MAP } from '@/lib/constants';
import type { RecruitmentStatus } from '@/lib/types';

/** Softer tinted styles for compact variant */
const COMPACT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  por_tratar:       { bg: 'bg-neutral-50',  text: 'text-neutral-600', border: 'border-neutral-200' },
  a_observar:       { bg: 'bg-yellow-50',   text: 'text-yellow-700',  border: 'border-yellow-300' },
  em_contacto:      { bg: 'bg-purple-50',   text: 'text-purple-700',  border: 'border-purple-200' },
  vir_treinar:      { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200' },
  reuniao_marcada:  { bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200' },
  a_decidir:        { bg: 'bg-blue-50',     text: 'text-blue-800',    border: 'border-blue-300' },
  confirmado:       { bg: 'bg-green-50',    text: 'text-green-700',   border: 'border-green-200' },
  assinou:          { bg: 'bg-green-50',    text: 'text-green-800',   border: 'border-green-300' },
  rejeitado:        { bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-200' },
};
const COMPACT_DEFAULT = { bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-200' };

interface StatusBadgeProps {
  status: RecruitmentStatus | string | null;
  /** 'pill' (default) — solid colored pills. 'compact' — tinted bg with border */
  variant?: 'pill' | 'compact';
  className?: string;
}

export function StatusBadge({ status, variant = 'pill', className }: StatusBadgeProps) {
  if (!status) return null;

  const label = RECRUITMENT_LABEL_MAP[status as RecruitmentStatus] ?? status;

  if (variant === 'compact') {
    const s = COMPACT_STYLES[status] ?? COMPACT_DEFAULT;
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-semibold',
          s.bg, s.border, s.text,
          className
        )}
      >
        {label}
      </span>
    );
  }

  const colorClass = RECRUITMENT_STATUS_MAP[status as RecruitmentStatus] ?? 'bg-neutral-200 text-neutral-700';
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
