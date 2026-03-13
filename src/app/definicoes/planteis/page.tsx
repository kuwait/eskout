// src/app/definicoes/planteis/page.tsx
// Dedicated page for managing custom squads — create, rename, delete
// Separated from Clube settings for cleaner navigation and focused UX
// RELEVANT FILES: src/components/admin/SquadManagement.tsx, src/app/definicoes/page.tsx, src/components/layout/nav-items.ts

import { SquadManagement } from '@/components/admin/SquadManagement';
import { getActiveClub } from '@/lib/supabase/club-context';

export default async function PlanteisAdminPage() {
  const { clubId } = await getActiveClub();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Plantéis</h1>
      <SquadManagement clubId={clubId} />
    </div>
  );
}
