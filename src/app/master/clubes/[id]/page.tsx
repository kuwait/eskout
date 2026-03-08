// src/app/master/clubes/[id]/page.tsx
// Superadmin club detail — settings, feature toggles, member list, invite admin
// Protected by middleware (only is_superadmin = true)
// RELEVANT FILES: src/app/master/clubes/page.tsx, src/actions/clubs.ts

import { notFound } from 'next/navigation';
import Image from 'next/image';
import { Shield, CheckCircle, XCircle } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { ClubDetailClient } from './ClubDetailClient';

export default async function MasterClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = await createServiceClient();

  const { data: club, error } = await service
    .from('clubs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !club) notFound();

  // Fetch members with profile info
  const { data: memberships } = await service
    .from('club_memberships')
    .select('id, role, joined_at, user_id, profiles:user_id(id, full_name)')
    .eq('club_id', id)
    .order('joined_at');

  // Fetch auth emails
  const { data: authData } = await service.auth.admin.listUsers();
  const emailMap = new Map((authData?.users ?? []).map((u) => [u.id, u.email]));

  const members = (memberships ?? []).map((m) => {
    const profile = m.profiles as unknown as { id: string; full_name: string };
    return {
      membershipId: m.id,
      userId: m.user_id,
      fullName: profile?.full_name ?? '—',
      email: emailMap.get(m.user_id) ?? '—',
      role: m.role,
      joinedAt: m.joined_at,
    };
  });

  // Count data per table
  const [playersCount, reportsCount] = await Promise.all([
    service.from('players').select('id', { count: 'exact', head: true }).eq('club_id', id),
    service.from('scouting_reports').select('id', { count: 'exact', head: true }).eq('club_id', id),
  ]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        {club.logo_url ? (
          <Image src={club.logo_url} alt="" width={48} height={48} className="rounded" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-neutral-100">
            <Shield className="h-6 w-6 text-neutral-400" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{club.name}</h1>
          <p className="text-sm text-muted-foreground">/{club.slug}</p>
        </div>
        {club.is_active ? (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            <CheckCircle className="h-3.5 w-3.5" /> Ativo
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-600">
            <XCircle className="h-3.5 w-3.5" /> Inativo
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border bg-white p-3 text-center">
          <p className="text-xl font-bold">{members.length}</p>
          <p className="text-xs text-muted-foreground">Membros</p>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <p className="text-xl font-bold">{playersCount.count ?? 0}</p>
          <p className="text-xs text-muted-foreground">Jogadores</p>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <p className="text-xl font-bold">{reportsCount.count ?? 0}</p>
          <p className="text-xs text-muted-foreground">Relatórios</p>
        </div>
      </div>

      {/* Client-side management (features, members, invite) */}
      <ClubDetailClient
        clubId={id}
        clubName={club.name}
        features={(club.features ?? {}) as Record<string, boolean>}
        isActive={club.is_active}
        members={members}
      />
    </div>
  );
}
