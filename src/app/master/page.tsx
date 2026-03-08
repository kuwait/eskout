// src/app/master/page.tsx
// Superadmin dashboard — total clubs, total users, active clubs, recent activity
// Protected by middleware (only is_superadmin = true)
// RELEVANT FILES: src/app/master/layout.tsx, src/lib/supabase/server.ts

import { createServiceClient } from '@/lib/supabase/server';
import { Building2, Users, Activity, CheckCircle } from 'lucide-react';

export default async function MasterDashboardPage() {
  const service = await createServiceClient();

  const [clubsRes, membershipsRes, authRes] = await Promise.all([
    service.from('clubs').select('id, is_active', { count: 'exact' }),
    service.from('club_memberships').select('id', { count: 'exact' }),
    service.auth.admin.listUsers(),
  ]);

  const totalClubs = clubsRes.count ?? 0;
  const activeClubs = (clubsRes.data ?? []).filter((c) => c.is_active).length;
  const totalMemberships = membershipsRes.count ?? 0;
  const totalUsers = authRes.data?.users?.length ?? 0;

  const stats = [
    { label: 'Total Clubes', value: totalClubs, icon: Building2, color: 'bg-purple-100 text-purple-700' },
    { label: 'Clubes Ativos', value: activeClubs, icon: CheckCircle, color: 'bg-green-100 text-green-700' },
    { label: 'Total Utilizadores', value: totalUsers, icon: Users, color: 'bg-blue-100 text-blue-700' },
    { label: 'Memberships', value: totalMemberships, icon: Activity, color: 'bg-amber-100 text-amber-700' },
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
    </div>
  );
}
