// src/app/escolher-clube/ClubPickerList.tsx
// Client component for club picker — handles click to select club
// Shows club cards with logo, name, and role badge
// RELEVANT FILES: src/app/escolher-clube/page.tsx, src/actions/clubs.ts

'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Building2, Shield, Loader2 } from 'lucide-react';
import { selectClub } from '@/actions/clubs';
import type { UserRole } from '@/lib/types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  scout: 'Observador',
  recruiter: 'Recrutador',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-blue-100 text-blue-700',
  editor: 'bg-green-100 text-green-700',
  scout: 'bg-amber-100 text-amber-700',
  recruiter: 'bg-purple-100 text-purple-700',
};

interface ClubItem {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: UserRole;
}

export function ClubPickerList({
  clubs,
  isSuperadmin,
}: {
  clubs: ClubItem[];
  isSuperadmin: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelect(clubId: string) {
    setLoading(clubId);
    try {
      await selectClub(clubId);
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {clubs.map((club) => (
        <button
          key={club.id}
          type="button"
          onClick={() => handleSelect(club.id)}
          disabled={loading !== null}
          className="flex w-full items-center gap-3 rounded-lg border bg-white p-4 text-left transition-colors hover:bg-neutral-50 disabled:opacity-50"
        >
          {club.logoUrl ? (
            <Image src={club.logoUrl} alt="" width={40} height={40} className="rounded shrink-0" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-100">
              <Shield className="h-5 w-5 text-neutral-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{club.name}</p>
            <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_COLORS[club.role]}`}>
              {ROLE_LABELS[club.role]}
            </span>
          </div>
          {loading === club.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </button>
      ))}

      {/* Superadmin panel link */}
      {isSuperadmin && (
        <Link
          href="/master"
          className="flex w-full items-center gap-3 rounded-lg border border-purple-200 bg-purple-50 p-4 text-left transition-colors hover:bg-purple-100"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-purple-100">
            <Building2 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-purple-700">Gestão Eskout</p>
            <p className="text-xs text-purple-500">Painel de superadministrador</p>
          </div>
        </Link>
      )}
    </div>
  );
}
