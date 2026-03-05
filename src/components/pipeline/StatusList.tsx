// src/components/pipeline/StatusList.tsx
// Mobile abordagens view — status selector + card list below
// Tap card to navigate, dropdown to change status
// RELEVANT FILES: src/components/pipeline/PipelineCard.tsx, src/components/pipeline/PipelineView.tsx, src/lib/constants.ts

'use client';

import { useState } from 'react';
import { RECRUITMENT_STATUSES } from '@/lib/constants';
import { PipelineCard } from '@/components/pipeline/PipelineCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Player, RecruitmentStatus } from '@/lib/types';

interface StatusListProps {
  playersByStatus: Record<RecruitmentStatus, Player[]>;
  showBirthYear?: boolean;
  onPlayerClick?: (playerId: number) => void;
  onStatusChange: (playerId: number, newStatus: RecruitmentStatus) => void;
  onRemove: (playerId: number) => void;
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate', newDate: string | null) => void;
}

export function StatusList({ playersByStatus, showBirthYear, onPlayerClick, onStatusChange, onRemove, onDateChange }: StatusListProps) {
  const [activeStatus, setActiveStatus] = useState<RecruitmentStatus>('por_tratar');
  const players = playersByStatus[activeStatus] ?? [];

  return (
    <div className="space-y-4">
      {/* Status selector */}
      <Select
        value={activeStatus}
        onValueChange={(v) => setActiveStatus(v as RecruitmentStatus)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RECRUITMENT_STATUSES.map((s) => {
            const count = playersByStatus[s.value]?.length ?? 0;
            return (
              <SelectItem key={s.value} value={s.value}>
                {s.labelPt} ({count})
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {/* Player list */}
      <div className="space-y-2">
        {players.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem jogadores neste estado.
          </p>
        )}
        {players.map((player) => (
          <div key={player.id} className="space-y-1">
            <PipelineCard player={player} showBirthYear={showBirthYear} onPlayerClick={onPlayerClick} onRemove={onRemove} onDateChange={onDateChange} />
            {/* Quick status change — abordagens statuses + remove */}
            <Select
              value={player.recruitmentStatus ?? ''}
              onValueChange={(v) => {
                if (v === '__remove__') { onRemove(player.id); return; }
                onStatusChange(player.id, v as RecruitmentStatus);
              }}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECRUITMENT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.labelPt}
                  </SelectItem>
                ))}
                <SelectItem value="__remove__" className="text-red-600">
                  Remover das Abordagens
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
