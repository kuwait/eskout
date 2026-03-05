// src/components/players/StatusHistory.tsx
// Displays the full status change history for a player
// Shows date, author, field changed, old → new value, optional note
// RELEVANT FILES: src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx, src/lib/types/index.ts

import { RECRUITMENT_LABEL_MAP } from '@/lib/constants';
import type { StatusHistoryEntry, RecruitmentStatus } from '@/lib/types';

interface StatusHistoryProps {
  entries: StatusHistoryEntry[];
}

/** Translate field names and values to user-friendly Portuguese */
function formatFieldName(field: string): string {
  const labels: Record<string, string> = {
    recruitment_status: 'Estado de recrutamento',
    is_shadow_squad: 'Plantel sombra',
    is_real_squad: 'Plantel real',
    shadow_position: 'Posição sombra',
    department_opinion: 'Opinião departamento',
  };
  return labels[field] ?? field;
}

function formatValue(field: string, value: string | null): string {
  if (!value) return '—';
  if (field === 'recruitment_status') {
    return RECRUITMENT_LABEL_MAP[value as RecruitmentStatus] ?? value;
  }
  if (field === 'is_shadow_squad' || field === 'is_real_squad') {
    return value === 'true' ? 'Sim' : 'Não';
  }
  return value;
}

export function StatusHistory({ entries }: StatusHistoryProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem histórico de alterações.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-md border p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">{entry.changedByName}</span>
            <span>{formatDateTime(entry.createdAt)}</span>
          </div>
          <p className="text-sm">
            <span className="font-medium">{formatFieldName(entry.fieldChanged)}</span>
            {': '}
            <span className="text-muted-foreground">
              {formatValue(entry.fieldChanged, entry.oldValue)}
            </span>
            {' → '}
            <span className="font-medium">
              {formatValue(entry.fieldChanged, entry.newValue)}
            </span>
          </p>
          {entry.notes && (
            <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
