// src/app/jogadores/[id]/page.tsx
// Player profile page — displays full player details with collapsible sections
// Uses get_player_profile RPC to fetch all data in a single round-trip (was 12-14 queries)
// RELEVANT FILES: src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx, src/lib/supabase/mappers.ts

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCurrentUserRole } from '@/lib/supabase/queries';
import { getPlayerFpfPlayingUp } from '@/actions/players';
import { getPlayerListMemberships } from '@/actions/player-lists';
import { getShareTokensForFeedbacks } from '@/actions/training-feedback';
import { detectPlayingUp } from '@/lib/utils/playing-up';
import { createClient } from '@/lib/supabase/server';
import { getActiveClubId } from '@/lib/supabase/club-context';
import { mapPlayerRow, mapScoutingReportRow, mapSquadPlayerRow, mapSquadRow } from '@/lib/supabase/mappers';
import { PlayerProfile } from '@/components/players/PlayerProfile';
import type { PlayerRow, ScoutingReportRow, SquadPlayerRow, SquadRow, ObservationNote, StatusHistoryEntry, ScoutEvaluation, QuickScoutReport, TrainingFeedback, PlayerVideo } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/* ───────────── Open Graph metadata for WhatsApp/social sharing ───────────── */

/**
 * Generic OG metadata only — was previously leaking PII (player name, DOB, club, photo)
 * via service-role lookup with no auth, accessible to anyone with a player ID.
 * Player photos and personal data are sensitive (often minors). Real preview happens
 * after login, which is the right boundary for any rich data.
 */
export function generateMetadata(): Metadata {
  return {
    title: 'Eskout — Perfil de jogador',
    description: 'Plataforma de scouting e recrutamento de formação',
    openGraph: {
      title: 'Eskout',
      description: 'Plataforma de scouting e recrutamento de formação',
    },
  };
}

/* ───────────── RPC result mappers ───────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNotes(rows: any[], referredBy: string | null): ObservationNote[] {
  return rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    authorId: row.author_id,
    authorName: row.author_id ? (row.author_name ?? 'Desconhecido') : (referredBy || 'Importado'),
    content: row.content,
    matchContext: row.match_context,
    priority: row.priority ?? 'normal',
    createdAt: row.created_at,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHistory(rows: any[]): StatusHistoryEntry[] {
  return rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    changedByName: row.changed_by_name ?? 'Sistema',
    notes: row.notes,
    createdAt: row.created_at,
    contactPurposeId: row.contact_purpose_id ?? null,
    contactPurposeCustom: row.contact_purpose_custom ?? null,
    contactPurposeLabel: row.contact_purpose_label ?? undefined,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvaluations(rows: any[]): ScoutEvaluation[] {
  return rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    userId: row.user_id,
    userName: row.user_name ?? 'Scout',
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapQuickReports(rows: any[]): QuickScoutReport[] {
  // Parse Postgres string arrays ("{val1,val2}") to JS arrays
  const parseArr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.startsWith('{')) return v.slice(1, -1).split(',').filter(Boolean);
    return [];
  };

  return rows.map((row) => ({
    id: row.id,
    clubId: row.club_id,
    playerId: row.player_id,
    authorId: row.author_id,
    authorName: row.author_name ?? 'Scout',
    ratingTecnica: row.rating_tecnica,
    ratingTatica: row.rating_tatica,
    ratingFisico: row.rating_fisico,
    ratingMentalidade: row.rating_mentalidade,
    ratingPotencial: row.rating_potencial,
    ratingOverall: row.rating_overall,
    recommendation: row.recommendation,
    tagsTecnica: parseArr(row.tags_tecnica),
    tagsTatica: parseArr(row.tags_tatica),
    tagsFisico: parseArr(row.tags_fisico),
    tagsMentalidade: parseArr(row.tags_mentalidade),
    tagsPotencial: parseArr(row.tags_potencial),
    maturation: row.maturation ?? null,
    observedFoot: row.observed_foot ?? null,
    heightScale: row.height_scale ?? null,
    buildScale: row.build_scale ?? null,
    speedScale: row.speed_scale ?? null,
    intensityScale: row.intensity_scale ?? null,
    maturationScale: row.maturation_scale ?? null,
    opponentLevel: row.opponent_level ?? null,
    observedPosition: row.observed_position ?? null,
    minutesObserved: row.minutes_observed ?? null,
    standoutLevel: row.standout_level ?? null,
    starter: row.starter ?? null,
    subMinute: row.sub_minute ?? null,
    conditions: parseArr(row.conditions),
    competition: row.competition ?? null,
    opponent: row.opponent ?? null,
    matchDate: row.match_date ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFeedback(rows: any[]): TrainingFeedback[] {
  return rows.map((row) => ({
    id: row.id,
    clubId: row.club_id,
    playerId: row.player_id,
    authorId: row.author_id,
    authorName: row.author_name ?? 'Desconhecido',
    trainingDate: row.training_date,
    escalao: row.escalao,
    status: (row.status as TrainingFeedback['status']) ?? 'realizado',
    sessionTime: row.session_time ?? null,
    location: row.location ?? null,
    observedPosition: row.observed_position ?? null,
    isRetroactive: row.is_retroactive ?? false,
    cancelledAt: row.cancelled_at ?? null,
    cancelledReason: row.cancelled_reason ?? null,
    presence: row.presence as TrainingFeedback['presence'],
    feedback: row.feedback,
    rating: row.rating,
    decision: (row.decision as TrainingFeedback['decision']) ?? 'sem_decisao',
    heightScale: (row.height_scale as TrainingFeedback['heightScale']) ?? null,
    buildScale: (row.build_scale as TrainingFeedback['buildScale']) ?? null,
    speedScale: (row.speed_scale as TrainingFeedback['speedScale']) ?? null,
    intensityScale: (row.intensity_scale as TrainingFeedback['intensityScale']) ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    coachFeedback: row.coach_feedback ?? null,
    coachRating: row.coach_rating ?? null,
    coachDecision: (row.coach_decision as TrainingFeedback['coachDecision']) ?? null,
    coachHeightScale: (row.coach_height_scale as TrainingFeedback['coachHeightScale']) ?? null,
    coachBuildScale: (row.coach_build_scale as TrainingFeedback['coachBuildScale']) ?? null,
    coachSpeedScale: (row.coach_speed_scale as TrainingFeedback['coachSpeedScale']) ?? null,
    coachIntensityScale: (row.coach_intensity_scale as TrainingFeedback['coachIntensityScale']) ?? null,
    coachTags: Array.isArray(row.coach_tags) ? row.coach_tags : [],
    coachName: row.coach_name ?? null,
    coachSubmittedAt: row.coach_submitted_at ?? null,
    ratingPerformance: row.rating_performance ?? null,
    ratingPotential: row.rating_potential ?? null,
    maturation: (row.maturation as TrainingFeedback['maturation']) ?? null,
    coachRatingPerformance: row.coach_rating_performance ?? null,
    coachRatingPotential: row.coach_rating_potential ?? null,
    coachMaturation: (row.coach_maturation as TrainingFeedback['coachMaturation']) ?? null,
    coachObservedPosition: row.coach_observed_position ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVideos(rows: any[]): PlayerVideo[] {
  return rows.map((row) => ({
    id: row.id,
    clubId: row.club_id,
    playerId: row.player_id,
    url: row.url,
    videoId: row.video_id,
    title: row.title ?? null,
    thumbnail: row.thumbnail ?? null,
    note: row.note ?? null,
    addedBy: row.added_by,
    createdAt: row.created_at,
  }));
}

/* ───────────── Page Component ───────────── */

export default async function PlayerProfilePage({ params, searchParams: searchParamsPromise }: PageProps) {
  const { id } = await params;
  const searchParams = await searchParamsPromise;
  const playerId = parseInt(id, 10);

  if (isNaN(playerId)) notFound();

  const clubId = await getActiveClubId();
  const supabase = await createClient();

  // 3 parallel calls instead of 12-14:
  // 1. RPC: all player data in one round-trip
  // 2. Role: from club context (cached in middleware)
  // 3. Auth: current user session
  const [profileData, role, { data: { user: currentUser } }] = await Promise.all([
    supabase.rpc('get_player_profile', { p_player_id: playerId, p_club_id: clubId }),
    getCurrentUserRole(),
    supabase.auth.getUser(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = profileData.data as any;
  if (!data || !data.player) notFound();

  // Map player from RPC JSON to domain type
  const player = mapPlayerRow(data.player as PlayerRow);

  // Hydrate contact assigned name from RPC
  if (data.contact_assigned_name) {
    player.contactAssignedToName = data.contact_assigned_name;
  }

  // Map all related data using the same shapes as the original queries
  const notes = mapNotes(data.notes ?? [], player.referredBy || null);
  const statusHistory = mapHistory(data.status_history ?? []);
  const scoutingReports = (data.scouting_reports ?? []).map((r: ScoutingReportRow) => mapScoutingReportRow(r));
  const scoutEvaluations = mapEvaluations(data.scout_evaluations ?? []);
  const quickReports = mapQuickReports(data.quick_reports ?? []);
  const trainingFeedback = mapFeedback(data.training_feedback ?? []);
  const playerVideos = mapVideos(data.videos ?? []);
  const clubMembers = (data.club_members ?? []).map((m: { id: string; full_name: string }) => ({
    id: m.id,
    fullName: m.full_name,
  }));

  // Map squad memberships
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerSquads = (data.squads ?? []).map((row: any) => {
    const sp = mapSquadPlayerRow(row as SquadPlayerRow);
    const squadRaw = row.squad_data as SquadRow;
    const squad = mapSquadRow(squadRaw);
    return {
      ...sp,
      squad: { ...squad, ageGroupName: row.age_group_name ?? null },
    };
  });

  // Compute playing-up on server to avoid hydration mismatch (Date.now() can differ)
  const zzPlayingUp = detectPlayingUp(player);
  const birthYear = player.dob ? new Date(player.dob).getFullYear() : null;
  const fpfPlayingUp = birthYear ? await getPlayerFpfPlayingUp(playerId, birthYear) : [];

  // Fetch bookmark memberships + share tokens server-side (avoids client POST on mount)
  const stubIds = trainingFeedback
    .filter((f) => !f.feedback && !f.rating && !f.coachFeedback)
    .map((f) => f.id);
  const [listMemberships, shareTokens] = await Promise.all([
    getPlayerListMemberships(playerId),
    getShareTokensForFeedbacks(stubIds),
  ]);

  // Compute hybrid rating: report ratings + scout evaluations
  const reportRatings = scoutingReports.filter((r: { rating: number | null }) => r.rating !== null).map((r: { rating: number | null }) => r.rating!);
  const scoutRatings = scoutEvaluations.map((e) => e.rating);
  const allRatings = [...reportRatings, ...scoutRatings];
  if (allRatings.length > 0) {
    player.reportAvgRating = Math.round((allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 10) / 10;
    player.reportRatingCount = allRatings.length;
  }

  return (
    <div className="px-3 py-2 sm:p-4 lg:p-6">
      <PlayerProfile
        player={player}
        userRole={role ?? 'scout'}
        notes={notes}
        statusHistory={statusHistory}
        scoutingReports={scoutingReports}
        scoutEvaluations={scoutEvaluations}
        quickReports={quickReports}
        trainingFeedback={trainingFeedback}
        playerVideos={playerVideos}
        currentUserId={currentUser?.id ?? null}
        ageGroupName={data.age_group_name ?? null}
        clubMembers={clubMembers}
        playerSquads={playerSquads}
        fpfPlayingUp={fpfPlayingUp}
        zzPlayingUp={zzPlayingUp}
        initialListMemberships={listMemberships}
        initialShareTokens={shareTokens}
        qsrAutoOpen={searchParams?.qsr === '1' ? {
          competition: (searchParams.competition as string) ?? undefined,
          opponent: (searchParams.opponent as string) ?? undefined,
          matchDate: (searchParams.matchDate as string) ?? undefined,
          gameId: searchParams.gameId ? parseInt(searchParams.gameId as string, 10) : undefined,
        } : undefined}
      />
    </div>
  );
}
