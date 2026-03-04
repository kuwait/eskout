// src/app/jogadores/[id]/page.tsx
// Player profile page — displays full player details with collapsible sections
// Server component that fetches player data and renders the profile
// RELEVANT FILES: src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx, src/components/common/OpinionBadge.tsx

import { notFound } from 'next/navigation';
import { getPlayerById, getCurrentUserRole } from '@/lib/supabase/queries';
import { PlayerProfile } from '@/components/players/PlayerProfile';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const playerId = parseInt(id, 10);

  if (isNaN(playerId)) notFound();

  const [player, role] = await Promise.all([
    getPlayerById(playerId),
    getCurrentUserRole(),
  ]);

  if (!player) notFound();

  return (
    <div className="p-4 lg:p-6">
      <PlayerProfile player={player} userRole={role ?? 'scout'} />
    </div>
  );
}
