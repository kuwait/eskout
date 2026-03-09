// src/app/master/page.tsx
// Superadmin dashboard — platform-wide stats (clubs, users, players, reports)
// Protected by middleware (only is_superadmin = true)
// RELEVANT FILES: src/app/master/layout.tsx, src/lib/supabase/server.ts

import { createServiceClient } from '@/lib/supabase/server';
import { Building2, Users, UserCheck, FileText } from 'lucide-react';

export default async function MasterDashboardPage() {
  const service = await createServiceClient();

  // Start of current month for "this month" counts
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [clubsRes, authRes, playersRes, reportsRes, playersMonthRes, reportsMonthRes] = await Promise.all([
    service.from('clubs').select('id', { count: 'exact', head: true }),
    service.auth.admin.listUsers(),
    service.from('players').select('id', { count: 'exact', head: true }),
    service.from('scouting_reports').select('id', { count: 'exact', head: true }),
    service.from('players').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    service.from('scouting_reports').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
  ]);

  const totalClubs = clubsRes.count ?? 0;
  const totalUsers = authRes.data?.users?.length ?? 0;
  const totalPlayers = playersRes.count ?? 0;
  const totalReports = reportsRes.count ?? 0;
  const playersThisMonth = playersMonthRes.count ?? 0;
  const reportsThisMonth = reportsMonthRes.count ?? 0;

  const stats = [
    { label: 'Total Clubes', value: totalClubs, icon: Building2, color: 'bg-purple-100 text-purple-700' },
    { label: 'Total Utilizadores', value: totalUsers, icon: Users, color: 'bg-blue-100 text-blue-700' },
    { label: 'Total Jogadores', value: totalPlayers, icon: UserCheck, color: 'bg-green-100 text-green-700' },
    { label: 'Total Relatórios', value: totalReports, icon: FileText, color: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-lg border bg-white p-4">
              <div className={`inline-flex rounded-md p-2 ${stat.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Activity this month */}
      <h2 className="text-lg font-semibold mt-8 mb-4">Este mês</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-2xl font-bold">{playersThisMonth}</p>
          <p className="text-sm text-muted-foreground">Jogadores adicionados</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-2xl font-bold">{reportsThisMonth}</p>
          <p className="text-sm text-muted-foreground">Relatórios submetidos</p>
        </div>
      </div>
    </div>
  );
}
