// src/app/observacoes/page.tsx
// Main scouting observations page — lists scouting rounds for the club
// Admin/editor manage rounds; scouts see published rounds (their assignments in Phase 16E)
// RELEVANT FILES: src/actions/scouting-rounds.ts, src/app/observacoes/ObservacoesClient.tsx

import { getActiveClub } from '@/lib/supabase/club-context';
import { getScoutingRounds } from '@/actions/scouting-rounds';
import { ObservacoesClient } from './ObservacoesClient';

export default async function ObservacoesPage() {
  const { role } = await getActiveClub();
  const rounds = await getScoutingRounds();

  return <ObservacoesClient rounds={rounds} userRole={role} />;
}
