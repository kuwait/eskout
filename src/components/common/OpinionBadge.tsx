// src/components/common/OpinionBadge.tsx
// Colored badge component for department opinion values — supports single or array
// Maps each opinion to its corresponding status color per brand guidelines
// RELEVANT FILES: src/lib/constants.ts, src/lib/types/index.ts, src/components/players/PlayerCard.tsx

import { cn } from '@/lib/utils';
import { OPINION_COLOR_MAP } from '@/lib/constants';
import type { DepartmentOpinion } from '@/lib/types';

/** Softer color variants for the strip style — border + tinted bg instead of solid */
const STRIP_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  '1ª Escolha':       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500' },
  '2ª Escolha':       { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200', dot: 'bg-orange-500' },
  'Acompanhar':       { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-300', dot: 'bg-yellow-500' },
  'Por Observar':     { bg: 'bg-neutral-50',  text: 'text-neutral-600', border: 'border-neutral-200', dot: 'bg-neutral-400' },
  'Urgente Observar': { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200', dot: 'bg-orange-500' },
  'Sem interesse':    { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200',    dot: 'bg-red-500' },
  'Potencial':        { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200', dot: 'bg-purple-500' },
  'Ver em treino':    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',   dot: 'bg-cyan-500' },
  'Stand-by':         { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',  dot: 'bg-slate-500' },
  'Assinar':          { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',  dot: 'bg-green-500' },
};
const STRIP_DEFAULT = { bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-200', dot: 'bg-neutral-400' };

interface OpinionBadgeProps {
  /** Accepts a single opinion, an array of opinions, or empty/null */
  opinion: DepartmentOpinion | DepartmentOpinion[] | '' | null;
  /** 'pill' (default) — solid colored pills. 'compact' — small refined cards with dot + border. 'strip' — larger version */
  variant?: 'pill' | 'compact' | 'strip';
  className?: string;
}

export function OpinionBadge({ opinion, variant = 'pill', className }: OpinionBadgeProps) {
  // Normalize to array
  const opinions: DepartmentOpinion[] = Array.isArray(opinion)
    ? opinion
    : opinion ? [opinion as DepartmentOpinion] : [];

  if (opinions.length === 0) return null;

  /* ── Compact / Strip variant — refined cards with colored dot + soft tinted bg ── */
  if (variant === 'compact' || variant === 'strip') {
    const isCompact = variant === 'compact';
    return (
      <div className={cn('inline-flex flex-wrap gap-1', className)}>
        {opinions.map((op) => {
          const s = STRIP_STYLES[op] ?? STRIP_DEFAULT;
          return (
            <span
              key={op}
              className={`inline-flex items-center gap-1 rounded-md border ${s.bg} ${s.border} ${isCompact ? 'px-2.5 py-1' : 'px-2.5 py-1 rounded-lg gap-1.5'}`}
            >
              {!isCompact && <span className={`shrink-0 rounded-full ${s.dot} h-1.5 w-1.5`} />}
              <span className={`font-semibold ${s.text} ${isCompact ? 'text-[10px]' : 'text-[11px]'}`}>{op}</span>
            </span>
          );
        })}
      </div>
    );
  }

  /* ── Pill variant (default) — solid colored pills ── */
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
