// src/components/dashboard/RecentChanges.tsx
// Shows the last N status changes across all players in the age group
// Each entry links to the player profile
// RELEVANT FILES: src/lib/supabase/queries.ts, src/app/page.tsx, src/lib/constants.ts

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RECRUITMENT_LABEL_MAP } from '@/lib/constants';
import type { RecentChange } from '@/lib/supabase/queries';
import type { RecruitmentStatus } from '@/lib/types';

interface RecentChangesProps {
  changes: RecentChange[];
}

function formatValue(field: string, value: string | null): string {
  if (!value) return '—';
  if (field === 'recruitment_status') {
    return RECRUITMENT_LABEL_MAP[value as RecruitmentStatus] ?? value;
  }
  if (value === 'true') return 'Sim';
  if (value === 'false') return 'Não';
  return value;
}

export function RecentChanges({ changes }: RecentChangesProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Alterações Recentes</CardTitle>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem alterações recentes.</p>
        ) : (
          <div className="space-y-2">
            {changes.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/jogadores/${c.playerId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {c.playerName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatValue(c.fieldChanged, c.oldValue)} → {formatValue(c.fieldChanged, c.newValue)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">{c.changedByName}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(c.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('pt-PT', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
