// src/app/escolher-clube/page.tsx
// Club picker page — shown when user has 2+ clubs or needs to select one
// Also shows "no clubs" state and superadmin panel link
// RELEVANT FILES: src/lib/supabase/club-context.ts, src/actions/clubs.ts, src/middleware.ts

import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getUserClubs } from '@/lib/supabase/club-context';
import { ClubPickerList } from './ClubPickerList';

export default async function EscolherClubePage() {
  const { clubs, isSuperadmin } = await getUserClubs();

  // If no clubs and not superadmin, show message
  if (clubs.length === 0 && !isSuperadmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm text-center">
          <Image src="/logo-icon.svg" alt="Eskout" width={48} height={48} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Sem clube associado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A tua conta não está associada a nenhum clube. Contacta o administrador para ser adicionado.
          </p>
        </div>
      </div>
    );
  }

  // If exactly 1 club, auto-select (middleware usually handles this, but just in case)
  if (clubs.length === 1 && !isSuperadmin) {
    // This page was accessed directly — redirect to trigger middleware auto-select
    redirect('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo-icon.svg" alt="Eskout" width={48} height={48} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Escolher Clube</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Seleciona o clube com que queres trabalhar
          </p>
        </div>

        <ClubPickerList clubs={clubs} isSuperadmin={isSuperadmin} />
      </div>
    </div>
  );
}
