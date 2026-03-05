// src/app/jogadores/[id]/page.tsx
// Player profile page — displays full player details with collapsible sections
// Server component that fetches player data, notes, and status history
// RELEVANT FILES: src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx, src/components/players/ObservationNotes.tsx

import { notFound } from 'next/navigation';
import {
  getPlayerById,
  getCurrentUserRole,
  getObservationNotes,
  getStatusHistory,
} from '@/lib/supabase/queries';
import { PlayerProfile } from '@/components/players/PlayerProfile';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const playerId = parseInt(id, 10);

  if (isNaN(playerId)) notFound();

  const [player, role, notes, statusHistory] = await Promise.all([
    getPlayerById(playerId),
    getCurrentUserRole(),
    getObservationNotes(playerId),
    getStatusHistory(playerId),
  ]);

  if (!player) notFound();

  return (
    <div className="p-4 lg:p-6">
      <PlayerProfile
        player={player}
        userRole={role ?? 'scout'}
        notes={notes}
        statusHistory={statusHistory}
      />
    </div>
  );
}
