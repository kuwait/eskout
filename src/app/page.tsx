// src/app/page.tsx
// Dashboard page — shows overview stats for the selected age group
// Phase 1 placeholder; full metrics and charts will be added in Phase 2
// RELEVANT FILES: src/components/layout/AppShell.tsx, src/hooks/useAgeGroup.ts, src/lib/supabase/queries.ts

'use client';

import { useAgeGroup } from '@/hooks/useAgeGroup';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Shield, GitBranch, MapPin } from 'lucide-react';

export default function DashboardPage() {
  const { selected } = useAgeGroup();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Painel</h1>

      {!selected ? (
        <p className="text-muted-foreground">Selecione um escalão para ver o painel.</p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {selected.name} ({selected.generationYear})
          </p>

          {/* Placeholder stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Users} label="Jogadores" value="—" />
            <StatCard icon={Shield} label="Plantel Sombra" value="—" />
            <StatCard icon={GitBranch} label="Pipeline" value="—" />
            <StatCard icon={MapPin} label="Posições Cobertas" value="—" />
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Dashboard completo será adicionado na Phase 2.
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
