// src/components/reports/ReportTagButton.tsx
// Inline tag toggle buttons for admin reports — Prioritário, Rever, Contactar
// Optimistic UI: toggles immediately, reverts on error. Active = colored pill with label.
// RELEVANT FILES: src/actions/scout-reports.ts, src/components/reports/ReportsView.tsx

'use client';

import { useTransition, useState } from 'react';
import { Flag, RotateCcw, Phone } from 'lucide-react';
import { toggleReportTag } from '@/actions/scout-reports';

const TAG_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
  inactiveClass: string;
  activeClass: string;
}> = {
  'Prioritário': {
    icon: Flag,
    label: 'Prio.',
    inactiveClass: 'border-transparent text-neutral-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50',
    activeClass: 'border-red-200 bg-red-100 text-red-600',
  },
  'Rever': {
    icon: RotateCcw,
    label: 'Rever',
    inactiveClass: 'border-transparent text-neutral-400 hover:border-blue-200 hover:text-blue-500 hover:bg-blue-50',
    activeClass: 'border-blue-200 bg-blue-100 text-blue-600',
  },
  'Contactar': {
    icon: Phone,
    label: 'Cont.',
    inactiveClass: 'border-transparent text-neutral-400 hover:border-purple-200 hover:text-purple-500 hover:bg-purple-50',
    activeClass: 'border-purple-200 bg-purple-100 text-purple-600',
  },
};

export function ReportTagButtons({
  reportId,
  tags,
}: {
  reportId: number;
  tags: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTags, setOptimisticTags] = useState(tags);

  function handleToggle(tag: string) {
    const wasActive = optimisticTags.includes(tag);
    const newTags = wasActive
      ? optimisticTags.filter((t) => t !== tag)
      : [...optimisticTags, tag];
    setOptimisticTags(newTags);

    startTransition(async () => {
      const result = await toggleReportTag(reportId, tag);
      if (!result.success) {
        // Revert on error
        setOptimisticTags(tags);
      }
    });
  }

  return (
    <div className="flex gap-1">
      {Object.entries(TAG_CONFIG).map(([tag, config]) => {
        const Icon = config.icon;
        const isActive = optimisticTags.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={(e) => { e.stopPropagation(); handleToggle(tag); }}
            disabled={isPending}
            title={tag}
            aria-label={`${isActive ? 'Remover' : 'Marcar'} ${tag}`}
            aria-pressed={isActive}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all ${
              isActive ? config.activeClass : config.inactiveClass
            } ${isPending ? 'opacity-50' : ''}`}
          >
            <Icon className="h-3 w-3" />
            {isActive && <span>{config.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
