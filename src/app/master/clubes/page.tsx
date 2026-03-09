// src/app/master/clubes/page.tsx
// Superadmin clubs list — shows all clubs with status, member count, and creation actions
// Protected by middleware (only is_superadmin = true)
// RELEVANT FILES: src/app/master/layout.tsx, src/actions/clubs.ts

import Link from 'next/link';
import Image from 'next/image';
import { Shield, CheckCircle, XCircle } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { CreateClubForm } from './CreateClubForm';

export default async function MasterClubesPage() {
  const service = await createServiceClient();

  const { data: clubs } = await service
    .from('clubs')
    .select('*, club_memberships(count)')
    .neq('is_test', true)
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clubes</h1>
      </div>

      {/* Create club form */}
      <CreateClubForm />

      {/* Club list */}
      <div className="mt-6 space-y-3">
        {(clubs ?? []).map((club) => {
          const memberCount = (club.club_memberships as unknown as { count: number }[])?.[0]?.count ?? 0;
          return (
            <Link
              key={club.id}
              href={`/master/clubes/${club.id}`}
              className="flex items-center gap-4 rounded-lg border bg-white p-4 transition-colors hover:bg-neutral-50"
            >
              {club.logo_url ? (
                <Image src={club.logo_url} alt="" width={40} height={40} className="rounded shrink-0" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-100">
                  <Shield className="h-5 w-5 text-neutral-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{club.name}</p>
                <p className="text-xs text-muted-foreground">/{club.slug} &middot; {memberCount} membros</p>
              </div>
              {club.is_active ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="h-3.5 w-3.5" /> Ativo
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-red-500">
                  <XCircle className="h-3.5 w-3.5" /> Inativo
                </span>
              )}
            </Link>
          );
        })}

        {(!clubs || clubs.length === 0) && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum clube criado</p>
        )}
      </div>
    </div>
  );
}
