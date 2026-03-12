// src/components/dashboard/StatsCards.tsx
// Counter cards showing key metrics: total players, real squad, shadow squad, pipeline active
// Server component — receives pre-computed stats
// RELEVANT FILES: src/lib/supabase/queries.ts, src/app/page.tsx, src/components/ui/card.tsx

import { Users, Shield, GitBranch, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatsCardsProps {
  totalPlayers: number;
  realSquadCount: number;
  shadowSquadCount: number;
  pipelineActiveCount: number;
}

const CARDS = [
  { key: 'total', icon: Users, label: 'Jogadores' },
  { key: 'real', icon: Shield, label: 'Plantel' },
  { key: 'shadow', icon: MapPin, label: 'Plantel Sombra' },
  { key: 'pipeline', icon: GitBranch, label: 'Pipeline Ativo' },
] as const;

export function StatsCards({
  totalPlayers,
  realSquadCount,
  shadowSquadCount,
  pipelineActiveCount,
}: StatsCardsProps) {
  const values: Record<string, number> = {
    total: totalPlayers,
    real: realSquadCount,
    shadow: shadowSquadCount,
    pipeline: pipelineActiveCount,
  };

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map(({ key, icon: Icon, label }) => (
        <Card key={key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{values[key]}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
