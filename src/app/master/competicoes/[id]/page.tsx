// src/app/master/competicoes/[id]/page.tsx
// Competition detail page — server component that fetches competition data and renders stats client
// Entry point for viewing individual competition statistics, standings, and Playing Up detection
// RELEVANT FILES: src/app/master/competicoes/[id]/CompetitionStatsClient.tsx, src/actions/scraping/fpf-competitions/stats.ts

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { FpfCompetitionRow } from '@/lib/types';
import { CompetitionStatsClient } from './CompetitionStatsClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CompetitionDetailPage({ params }: Props) {
  const { id } = await params;
  const competitionId = parseInt(id, 10);
  if (isNaN(competitionId)) notFound();

  const supabase = await createClient();

  // Verify user has access
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin, can_view_competitions')
    .eq('id', user.id)
    .single();

  if (!profile?.is_superadmin && !profile?.can_view_competitions) notFound();

  // Fetch competition
  const { data: comp } = await supabase
    .from('fpf_competitions')
    .select('*')
    .eq('id', competitionId)
    .single();

  if (!comp) notFound();

  return <CompetitionStatsClient competition={comp as FpfCompetitionRow} />;
}
