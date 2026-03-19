// src/app/admin/dados/page.tsx
// Admin data hub — stats overview with links to sub-pages (quality, import)
// Shows key database statistics at a glance
// RELEVANT FILES: src/app/admin/dados/qualidade/page.tsx, src/app/admin/dados/importar/page.tsx

import Link from 'next/link';
import { Database, Users, FileText, AlertTriangle, Shield, GitBranch, ListTodo, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';

async function getStats() {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const [players, reports, notes, pipeline, realSquad, shadowSquad, tasks, ageGroups, history] = await Promise.all([
    supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
    supabase.from('scouting_reports').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
    supabase.from('observation_notes').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
    supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId).not('recruitment_status', 'is', null),
    supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('is_real_squad', true),
    supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('is_shadow_squad', true),
    supabase.from('user_tasks').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('completed', false),
    supabase.from('age_groups').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
    supabase.from('status_history').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
  ]);

  return {
    players: players.count ?? 0,
    reports: reports.count ?? 0,
    notes: notes.count ?? 0,
    pipeline: pipeline.count ?? 0,
    realSquad: realSquad.count ?? 0,
    shadowSquad: shadowSquad.count ?? 0,
    tasks: tasks.count ?? 0,
    ageGroups: ageGroups.count ?? 0,
    history: history.count ?? 0,
  };
}

export default async function DadosPage() {
  const stats = await getStats();

  const cards = [
    { label: 'Jogadores', value: stats.players, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Escalões', value: stats.ageGroups, icon: Shield, color: 'text-purple-600 bg-purple-50' },
    { label: 'Relatórios', value: stats.reports, icon: FileText, color: 'text-green-600 bg-green-50' },
    { label: 'Notas de Observação', value: stats.notes, icon: FileText, color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Em Abordagens', value: stats.pipeline, icon: GitBranch, color: 'text-orange-600 bg-orange-50' },
    { label: 'Plantel Real', value: stats.realSquad, icon: Shield, color: 'text-green-600 bg-green-50' },
    { label: 'Plantel Sombra', value: stats.shadowSquad, icon: Shield, color: 'text-purple-600 bg-purple-50' },
    { label: 'Tarefas Pendentes', value: stats.tasks, icon: ListTodo, color: 'text-red-600 bg-red-50' },
    { label: 'Alterações no Histórico', value: stats.history, icon: Database, color: 'text-neutral-600 bg-neutral-100' },
  ];

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-6 text-xl font-bold lg:text-2xl">Dados</h1>

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold">{card.value.toLocaleString('pt-PT')}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Quick links to sub-pages */}
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase">Ferramentas</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/dados/qualidade"
          className="flex items-center gap-3 rounded-lg border bg-white p-4 transition-colors hover:border-orange-300 hover:bg-orange-50/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Qualidade de Dados</p>
            <p className="text-xs text-muted-foreground">Jogadores com dados em falta ou inconsistentes</p>
          </div>
        </Link>

        <Link
          href="/admin/dados/importar"
          className="flex items-center gap-3 rounded-lg border bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Importar Clubes FPF</p>
            <p className="text-xs text-muted-foreground">Importar jogadores de clubes via FPF</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
