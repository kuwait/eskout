// src/actions/scout-reports.ts
// Server Actions for scouting reports — submission, listing, admin review
// All reports (PDF extractions + scout submissions) live in scouting_reports table
// RELEVANT FILES: src/app/submeter/page.tsx, src/app/meus-relatorios/page.tsx, src/app/admin/relatorios/page.tsx

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { birthYearToAgeGroup, CURRENT_SEASON } from '@/lib/constants';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';

/* ───────────── Types ───────────── */

/** Input shape for scout report submission form */
export interface ScoutReportInput {
  playerName: string;
  playerClub: string;
  fpfLink: string;
  zerozeroLink?: string;
  competition?: string;
  match?: string;
  matchDate?: string;
  matchResult?: string;
  shirtNumber?: string;
  birthYear?: string;
  foot?: string;
  position?: string;
  physicalProfile?: string;
  strengths?: string;
  weaknesses?: string;
  rating?: number;
  decision?: string;
  analysis?: string;
  contactInfo?: string;
  // Auto-populated from scrape — not manually entered
  nationality?: string;
  birthCountry?: string;
  height?: number;
  weight?: number;
  photoUrl?: string;
  dob?: string;
  secondaryPosition?: string;
  tertiaryPosition?: string;
  fpfPlayerId?: string;
  zerozeroPlayerId?: string;
}

/** Row shape returned to UI — maps from scouting_reports columns */
export interface ScoutReportRow {
  id: number;
  /** 'scout' = submitted via app, 'pdf' = extracted from PDF */
  source: 'scout' | 'pdf';
  playerName: string;
  playerClub: string | null;
  competition: string | null;
  match: string | null;
  matchDate: string | null;
  matchResult: string | null;
  shirtNumber: string | null;
  birthYear: string | null;
  foot: string | null;
  position: string | null;
  physicalProfile: string | null;
  strengths: string | null;
  weaknesses: string | null;
  rating: number | null;
  decision: string | null;
  analysis: string | null;
  contactInfo: string | null;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  playerId: number | null;
  authorName: string | null;
  createdAt: string;
  /** Admin tags — Prioritário, Rever, Contactar */
  adminTags: string[];
  /** Player-level data stored as JSONB — only for scout submissions */
  submissionPlayerData: SubmissionPlayerData | null;
}

/** Player-level data from scout submission — used during approval to create player */
interface SubmissionPlayerData {
  fpfLink?: string;
  fpfPlayerId?: string;
  zerozeroLink?: string;
  zerozeroPlayerId?: string;
  nationality?: string;
  birthCountry?: string;
  height?: number;
  weight?: number;
  photoUrl?: string;
  dob?: string;
  secondaryPosition?: string;
  tertiaryPosition?: string;
}

/* ───────────── Helpers ───────────── */

/** Parse admin_tags — handles both JS array and Postgres string "{val1,val2}" formats */
function parseAdminTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.startsWith('{')) {
    return raw.slice(1, -1).split(',').filter(Boolean);
  }
  return [];
}

/* ───────────── Row Mapper ───────────── */

function mapRow(r: Record<string, unknown>, authorName?: string | null): ScoutReportRow {
  const hasGdrive = !!(r.gdrive_file_id);
  const spd = r.submission_player_data as SubmissionPlayerData | null;
  return {
    id: r.id as number,
    source: hasGdrive ? 'pdf' : 'scout',
    playerName: (r.player_name_report as string) ?? '(sem nome)',
    playerClub: r.team_report as string | null,
    competition: r.competition as string | null,
    match: r.match as string | null,
    matchDate: r.match_date as string | null,
    matchResult: r.match_result as string | null,
    shirtNumber: r.shirt_number_report as string | null,
    birthYear: r.birth_year_report as string | null,
    foot: r.foot_report as string | null,
    position: r.position_report as string | null,
    physicalProfile: r.physical_profile as string | null,
    strengths: r.strengths as string | null,
    weaknesses: r.weaknesses as string | null,
    rating: r.rating as number | null,
    decision: r.decision as string | null,
    analysis: r.analysis as string | null,
    contactInfo: r.contact_info as string | null,
    status: (r.status as string as 'pendente' | 'aprovado' | 'rejeitado') ?? 'aprovado',
    playerId: r.player_id as number | null,
    authorName: authorName ?? (r.scout_name as string | null) ?? null,
    createdAt: r.created_at as string,
    adminTags: parseAdminTags(r.admin_tags),
    submissionPlayerData: spd,
  };
}

/** Supabase server client type — inferred from createClient() */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Fetch author names for scout-submitted reports
async function enrichWithAuthorNames(
  supabase: SupabaseServerClient,
  rows: Record<string, unknown>[],
): Promise<ScoutReportRow[]> {
  const authorIds = [...new Set(rows.map((r) => r.author_id as string).filter(Boolean))];
  if (authorIds.length === 0) return rows.map((r) => mapRow(r));

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', authorIds);

  const nameMap = new Map<string, string>();
  (profiles ?? []).forEach((p: { id: string; full_name: string }) => nameMap.set(p.id, p.full_name));

  return rows.map((r) => mapRow(r, nameMap.get(r.author_id as string)));
}

/* ───────────── Submit Report ───────────── */

export async function submitScoutReport(
  input: ScoutReportInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { clubId, userId, isDemo } = await getActiveClub();
    if (isDemo) return { success: false, error: 'Modo demonstração — apenas leitura' };
    const supabase = await createClient();

    if (!input.playerName.trim()) return { success: false, error: 'Nome do jogador é obrigatório' };
    if (!input.playerClub.trim()) return { success: false, error: 'Clube é obrigatório' };
    if (!input.fpfLink.trim()) return { success: false, error: 'Link FPF é obrigatório' };

    // Player-level data stored as JSONB — used during approval to create the player
    const submissionPlayerData: SubmissionPlayerData = {
      fpfLink: input.fpfLink.trim(),
      fpfPlayerId: input.fpfPlayerId?.trim() || undefined,
      zerozeroLink: input.zerozeroLink?.trim() || undefined,
      zerozeroPlayerId: input.zerozeroPlayerId?.trim() || undefined,
      nationality: input.nationality?.trim() || undefined,
      birthCountry: input.birthCountry?.trim() || undefined,
      height: input.height || undefined,
      weight: input.weight || undefined,
      photoUrl: input.photoUrl?.trim() || undefined,
      dob: input.dob || undefined,
      secondaryPosition: input.secondaryPosition || undefined,
      tertiaryPosition: input.tertiaryPosition || undefined,
    };

    const { data: inserted, error } = await supabase
      .from('scouting_reports')
      .insert({
        author_id: userId,
        club_id: clubId,
        status: 'pendente',
        extraction_status: 'success',
        // Report-level data in _report columns
        player_name_report: input.playerName.trim(),
        team_report: input.playerClub.trim(),
        position_report: input.position || null,
        shirt_number_report: input.shirtNumber?.trim() || null,
        birth_year_report: input.birthYear?.trim() || null,
        foot_report: input.foot || null,
        competition: input.competition?.trim() || null,
        match: input.match?.trim() || null,
        match_date: input.matchDate || null,
        match_result: input.matchResult?.trim() || null,
        physical_profile: input.physicalProfile?.trim() || null,
        strengths: input.strengths?.trim() || null,
        weaknesses: input.weaknesses?.trim() || null,
        rating: input.rating || null,
        decision: input.decision?.trim() || null,
        analysis: input.analysis?.trim() || null,
        contact_info: input.contactInfo?.trim() || null,
        // Player-level data as JSONB
        submission_player_data: submissionPlayerData,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath('/meus-relatorios');
    await broadcastRowMutation(clubId, 'scouting_reports', 'INSERT', userId, inserted!.id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── List My Reports (Scout) ───────────── */

export async function listMyScoutReports(): Promise<{ success: boolean; reports: ScoutReportRow[]; error?: string }> {
  try {
    const { clubId, userId } = await getActiveClub();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('scouting_reports')
      .select('*')
      .eq('author_id', userId)
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });

    if (error) return { success: false, reports: [], error: error.message };
    const reports = await enrichWithAuthorNames(supabase, (data ?? []) as Record<string, unknown>[]);
    return { success: true, reports };
  } catch (e) {
    return { success: false, reports: [], error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Get Single Report ───────────── */

export async function getScoutReport(id: number): Promise<{ report: ScoutReportRow | null; error?: string }> {
  try {
    const { clubId, userId, role } = await getActiveClub();
    const supabase = await createClient();

    const isAdminOrEditor = role === 'admin' || role === 'editor';

    let query = supabase.from('scouting_reports').select('*').eq('id', id).eq('club_id', clubId);
    if (!isAdminOrEditor) query = query.eq('author_id', userId);

    const { data, error } = await query.single();
    if (error || !data) return { report: null, error: error?.message || 'Relatório não encontrado' };

    const r = data as Record<string, unknown>;
    let authorName: string | null = null;
    if (r.author_id) {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', r.author_id as string).single();
      authorName = profile?.full_name ?? null;
    }

    return { report: mapRow(r, authorName) };
  } catch (e) {
    return { report: null, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── List All Reports (Admin/Editor) ───────────── */

export async function listAllScoutReports(
  statusFilter?: 'pendente' | 'aprovado' | 'rejeitado',
): Promise<{ success: boolean; reports: ScoutReportRow[]; error?: string }> {
  try {
    const { clubId, role } = await getActiveClub();
    const supabase = await createClient();

    if (role !== 'admin' && role !== 'editor') {
      return { success: false, reports: [], error: 'Sem permissão' };
    }

    let query = supabase
      .from('scouting_reports')
      .select('*')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial'])
      .order('created_at', { ascending: false });

    if (statusFilter) query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) return { success: false, reports: [], error: error.message };
    const reports = await enrichWithAuthorNames(supabase, (data ?? []) as Record<string, unknown>[]);
    return { success: true, reports };
  } catch (e) {
    return { success: false, reports: [], error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Pending Count (for sidebar badge) ───────────── */

export async function getPendingReportsCount(): Promise<number> {
  try {
    const { clubId } = await getActiveClub();
    const supabase = await createClient();
    const { count } = await supabase
      .from('scouting_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente')
      .eq('club_id', clubId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/* ───────────── Approve Report → Create Player ───────────── */

export async function approveScoutReport(
  reportId: number,
): Promise<{ success: boolean; playerId?: number; error?: string }> {
  try {
    const { clubId, userId, role, isDemo } = await getActiveClub();
    if (isDemo) return { success: false, error: 'Modo demonstração — apenas leitura' };
    const supabase = await createClient();

    if (role !== 'admin' && role !== 'editor') {
      return { success: false, error: 'Sem permissão' };
    }

    // Fetch the report
    const { data: report, error: fetchErr } = await supabase
      .from('scouting_reports').select('*').eq('id', reportId).eq('club_id', clubId).single();
    if (fetchErr || !report) return { success: false, error: 'Relatório não encontrado' };
    if (report.status !== 'pendente') return { success: false, error: 'Relatório já foi processado' };

    const r = report as Record<string, unknown>;
    const spd = (r.submission_player_data as SubmissionPlayerData) ?? {};

    // Check for duplicate player by FPF link
    const fpfLink = spd.fpfLink;
    if (fpfLink) {
      const { data: existing } = await supabase
        .from('players').select('id, name').eq('fpf_link', fpfLink).eq('club_id', clubId).maybeSingle();
      if (existing) {
        // Link to existing player — set player_id on the report
        await supabase.from('scouting_reports').update({
          status: 'aprovado',
          player_id: existing.id,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        }).eq('id', reportId).eq('club_id', clubId);

        revalidatePath('/admin/relatorios');
        revalidatePath('/meus-relatorios');
        revalidatePath(`/jogadores/${existing.id}`);
        await broadcastRowMutation(clubId, 'scouting_reports', 'UPDATE', userId, reportId);
        return { success: true, playerId: existing.id };
      }
    }

    // Determine age group from DOB or birthYear
    const dob = spd.dob ?? null;
    const birthYear = dob
      ? new Date(dob).getFullYear()
      : (r.birth_year_report as string | null) ? parseInt(r.birth_year_report as string, 10) : null;

    if (!birthYear) return { success: false, error: 'Sem data de nascimento — não é possível determinar o escalão' };

    const ageGroupName = birthYearToAgeGroup(birthYear);
    if (!ageGroupName) return { success: false, error: `Ano ${birthYear} não corresponde a nenhum escalão` };

    // Find or create age group
    let { data: ageGroup } = await supabase
      .from('age_groups').select('id')
      .eq('name', ageGroupName).eq('season', CURRENT_SEASON).single();

    if (!ageGroup) {
      const { data: newAg, error: agErr } = await supabase
        .from('age_groups')
        .insert({ name: ageGroupName, generation_year: birthYear, season: CURRENT_SEASON, club_id: clubId })
        .select('id').single();
      if (agErr) return { success: false, error: `Erro ao criar escalão: ${agErr.message}` };
      ageGroup = newAg;
    }

    // Create the player — report-level data from columns, player-level from JSONB
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .insert({
        age_group_id: ageGroup!.id,
        club_id: clubId,
        name: r.player_name_report as string,
        dob: dob || null,
        club: r.team_report as string,
        position_normalized: r.position_report as string | null,
        secondary_position: spd.secondaryPosition || null,
        tertiary_position: spd.tertiaryPosition || null,
        foot: r.foot_report as string | null,
        shirt_number: r.shirt_number_report as string | null,
        contact: r.contact_info as string | null,
        fpf_link: fpfLink || null,
        fpf_last_checked: fpfLink ? new Date().toISOString() : null,
        fpf_player_id: spd.fpfPlayerId || null,
        zerozero_link: spd.zerozeroLink || null,
        zz_last_checked: spd.zerozeroLink ? new Date().toISOString() : null,
        zerozero_player_id: spd.zerozeroPlayerId || null,
        photo_url: spd.photoUrl || null,
        height: spd.height || null,
        weight: spd.weight || null,
        nationality: spd.nationality || null,
        birth_country: spd.birthCountry || null,
        department_opinion: r.decision ? [r.decision as string] : ['Por Observar'],
        observer_decision: r.decision as string | null,
        recruitment_status: 'por_tratar',
        referred_by: r.author_id ? 'Scout' : null,
        created_by: userId,
      })
      .select('id')
      .single();

    if (playerErr) return { success: false, error: `Erro ao criar jogador: ${playerErr.message}` };

    // Link report to the new player
    await supabase.from('scouting_reports').update({
      status: 'aprovado',
      player_id: player!.id,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', reportId).eq('club_id', clubId);

    revalidatePath('/admin/relatorios');
    revalidatePath('/meus-relatorios');
    revalidatePath('/jogadores');
    await broadcastRowMutation(clubId, 'scouting_reports', 'UPDATE', userId, reportId);
    await broadcastRowMutation(clubId, 'players', 'INSERT', userId, player!.id);
    return { success: true, playerId: player!.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Reject Report ───────────── */

export async function rejectScoutReport(reportId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const { clubId, userId, role, isDemo } = await getActiveClub();
    if (isDemo) return { success: false, error: 'Modo demonstração — apenas leitura' };
    const supabase = await createClient();

    if (role !== 'admin' && role !== 'editor') {
      return { success: false, error: 'Sem permissão' };
    }

    const { error } = await supabase.from('scouting_reports').update({
      status: 'rejeitado',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', reportId).eq('status', 'pendente').eq('club_id', clubId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/relatorios');
    revalidatePath('/meus-relatorios');
    await broadcastRowMutation(clubId, 'scouting_reports', 'UPDATE', userId, reportId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Paginated Fetch Helper ───────────── */

/**
 * Fetches all rows from a Supabase query by paging through .range() in 1000-row chunks.
 * Needed because Supabase caps individual selects at 1000 rows by default.
 */
/** Structural type for a Supabase query builder that supports .range() pagination */
interface RangeableQuery {
  range(from: number, to: number): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
}

async function fetchAllRows(
  queryBuilder: RangeableQuery,
  pageSize = 1000,
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    allRows.push(...rows);
    hasMore = rows.length === pageSize;
    from += pageSize;
  }

  return allRows;
}

/* ───────────── List Reports Paginated ───────────── */

export async function listReportsPaginated(params: {
  page?: number;
  perPage?: number;
  search?: string;
  status?: string;
  scoutName?: string;
  decision?: string;
  ratingMin?: number;
  position?: string;
  sort?: 'date' | 'rating' | 'name';
  order?: 'asc' | 'desc';
  tag?: string;
}): Promise<{ reports: ScoutReportRow[]; totalCount: number; error?: string }> {
  try {
    const { clubId, role } = await getActiveClub();
    const supabase = await createClient();

    if (role !== 'admin' && role !== 'editor') {
      return { reports: [], totalCount: 0, error: 'Sem permissão' };
    }

    const page = params.page ?? 1;
    const perPage = params.perPage ?? 50;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    // Determine sort column and direction
    const sortColumn =
      params.sort === 'rating' ? 'rating'
      : params.sort === 'name' ? 'player_name_report'
      : 'created_at';
    const ascending = params.order === 'asc';

    let query = supabase
      .from('scouting_reports')
      .select('*', { count: 'exact' })
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial']);

    // Search across player name and team
    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      query = query.or(`player_name_report.ilike.${term},team_report.ilike.${term}`);
    }

    // Exact-match filters
    if (params.status) query = query.eq('status', params.status);
    if (params.decision) query = query.eq('decision', params.decision);
    if (params.position) query = query.eq('position_report', params.position);
    if (params.scoutName) query = query.eq('scout_name', params.scoutName);

    // Rating minimum
    if (params.ratingMin != null) query = query.gte('rating', params.ratingMin);

    // Tag filter — admin_tags is TEXT[], use contains for array inclusion
    if (params.tag) query = query.contains('admin_tags', [params.tag]);

    // Sort and paginate
    query = query.order(sortColumn, { ascending }).range(from, to);

    const { data, count, error } = await query;
    if (error) return { reports: [], totalCount: 0, error: error.message };

    const reports = await enrichWithAuthorNames(supabase, (data ?? []) as Record<string, unknown>[]);
    return { reports, totalCount: count ?? 0 };
  } catch (e) {
    return { reports: [], totalCount: 0, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Report KPIs ───────────── */

export async function getReportKpis(): Promise<{
  totalReports: number;
  uniquePlayers: number;
  avgRating: number | null;
  reportsThisMonth: number;
}> {
  const defaults = { totalReports: 0, uniquePlayers: 0, avgRating: null, reportsThisMonth: 0 };

  try {
    const { clubId } = await getActiveClub();
    const supabase = await createClient();

    // Total count
    const { count: totalReports } = await supabase
      .from('scouting_reports')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial']);

    // Fetch player names and ratings (lightweight columns) for unique players + avg rating
    const baseQuery = supabase
      .from('scouting_reports')
      .select('player_name_report, rating')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial']);

    const allRows = await fetchAllRows(baseQuery);

    const playerNames = new Set<string>();
    let ratingSum = 0;
    let ratingCount = 0;

    for (const row of allRows) {
      const name = row.player_name_report as string | null;
      if (name) playerNames.add(name.toLowerCase().trim());
      const rating = row.rating as number | null;
      if (rating != null) {
        ratingSum += rating;
        ratingCount++;
      }
    }

    // Reports this month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { count: reportsThisMonth } = await supabase
      .from('scouting_reports')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial'])
      .gte('created_at', firstOfMonth);

    return {
      totalReports: totalReports ?? 0,
      uniquePlayers: playerNames.size,
      avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
      reportsThisMonth: reportsThisMonth ?? 0,
    };
  } catch {
    return defaults;
  }
}

/* ───────────── Report Highlights ───────────── */

export async function getReportHighlights(): Promise<{
  bestRatedThisWeek: { playerName: string; rating: number; playerId: number | null } | null;
  mostObservedPlayer: { playerName: string; count: number; playerId: number | null } | null;
  mostActiveScout: { scoutName: string; count: number } | null;
}> {
  const defaults = { bestRatedThisWeek: null, mostObservedPlayer: null, mostActiveScout: null };

  try {
    const { clubId } = await getActiveClub();
    const supabase = await createClient();

    // Best rated this week — last 7 days, highest rating
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: bestRatedData } = await supabase
      .from('scouting_reports')
      .select('player_name_report, rating, player_id')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial'])
      .gte('created_at', sevenDaysAgo)
      .not('rating', 'is', null)
      .order('rating', { ascending: false })
      .limit(1);

    const bestRatedRow = bestRatedData?.[0];
    const bestRatedThisWeek = bestRatedRow
      ? {
          playerName: bestRatedRow.player_name_report as string,
          rating: bestRatedRow.rating as number,
          playerId: (bestRatedRow.player_id as number | null) ?? null,
        }
      : null;

    // Most observed player — count by player_name_report
    const nameQuery = supabase
      .from('scouting_reports')
      .select('player_name_report, player_id')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial']);

    const nameRows = await fetchAllRows(nameQuery);

    // Group by lowercased name, keep first player_id found
    const nameCountMap = new Map<string, { count: number; playerId: number | null; displayName: string }>();
    for (const row of nameRows) {
      const name = row.player_name_report as string | null;
      if (!name) continue;
      const key = name.toLowerCase().trim();
      const existing = nameCountMap.get(key);
      if (existing) {
        existing.count++;
        if (!existing.playerId && row.player_id) existing.playerId = row.player_id as number;
      } else {
        nameCountMap.set(key, { count: 1, playerId: (row.player_id as number | null) ?? null, displayName: name });
      }
    }

    let mostObservedPlayer: { playerName: string; count: number; playerId: number | null } | null = null;
    let maxNameCount = 0;
    for (const entry of nameCountMap.values()) {
      if (entry.count > maxNameCount) {
        maxNameCount = entry.count;
        mostObservedPlayer = { playerName: entry.displayName, count: entry.count, playerId: entry.playerId };
      }
    }

    // Most active scout — count by scout_name (non-null)
    const scoutQuery = supabase
      .from('scouting_reports')
      .select('scout_name')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial'])
      .not('scout_name', 'is', null);

    const scoutRows = await fetchAllRows(scoutQuery);

    const scoutCountMap = new Map<string, number>();
    for (const row of scoutRows) {
      const scoutName = row.scout_name as string;
      scoutCountMap.set(scoutName, (scoutCountMap.get(scoutName) ?? 0) + 1);
    }

    let mostActiveScout: { scoutName: string; count: number } | null = null;
    let maxScoutCount = 0;
    for (const [scoutName, count] of scoutCountMap.entries()) {
      if (count > maxScoutCount) {
        maxScoutCount = count;
        mostActiveScout = { scoutName, count };
      }
    }

    return { bestRatedThisWeek, mostObservedPlayer, mostActiveScout };
  } catch {
    return defaults;
  }
}

/* ───────────── Scout Stats ───────────── */

export async function getScoutStats(): Promise<{
  scouts: Array<{
    scoutName: string;
    reportCount: number;
    avgRating: number | null;
    monthlyTrend: number[];
  }>;
}> {
  try {
    const { clubId } = await getActiveClub();
    const supabase = await createClient();

    const query = supabase
      .from('scouting_reports')
      .select('scout_name, rating, created_at')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial'])
      .not('scout_name', 'is', null);

    const allRows = await fetchAllRows(query);

    // Build month boundaries for last 6 months (oldest first)
    const now = new Date();
    const monthBoundaries: { year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBoundaries.push({ year: d.getFullYear(), month: d.getMonth() });
    }

    // Group by scout name
    const scoutMap = new Map<string, {
      reportCount: number;
      ratingSum: number;
      ratingCount: number;
      monthlyCounts: number[];
    }>();

    for (const row of allRows) {
      const scoutName = row.scout_name as string;
      if (!scoutMap.has(scoutName)) {
        scoutMap.set(scoutName, { reportCount: 0, ratingSum: 0, ratingCount: 0, monthlyCounts: new Array(6).fill(0) });
      }
      const entry = scoutMap.get(scoutName)!;
      entry.reportCount++;

      const rating = row.rating as number | null;
      if (rating != null) {
        entry.ratingSum += rating;
        entry.ratingCount++;
      }

      // Determine which month bucket this report falls into
      const createdAt = new Date(row.created_at as string);
      const rowYear = createdAt.getFullYear();
      const rowMonth = createdAt.getMonth();
      const bucketIdx = monthBoundaries.findIndex((b) => b.year === rowYear && b.month === rowMonth);
      if (bucketIdx !== -1) entry.monthlyCounts[bucketIdx]++;
    }

    const scouts = Array.from(scoutMap.entries()).map(([scoutName, entry]) => ({
      scoutName,
      reportCount: entry.reportCount,
      avgRating: entry.ratingCount > 0 ? Math.round((entry.ratingSum / entry.ratingCount) * 10) / 10 : null,
      monthlyTrend: entry.monthlyCounts,
    }));

    // Sort by report count descending
    scouts.sort((a, b) => b.reportCount - a.reportCount);

    return { scouts };
  } catch {
    return { scouts: [] };
  }
}

/* ───────────── Activity Heatmap ───────────── */

export async function getActivityHeatmap(): Promise<Array<{ date: string; count: number }>> {
  try {
    const { clubId } = await getActiveClub();
    const supabase = await createClient();

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const query = supabase
      .from('scouting_reports')
      .select('created_at')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial'])
      .gte('created_at', oneYearAgo);

    const allRows = await fetchAllRows(query);

    // Group by day (YYYY-MM-DD)
    const dayMap = new Map<string, number>();
    for (const row of allRows) {
      const dateStr = (row.created_at as string).slice(0, 10); // YYYY-MM-DD
      dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + 1);
    }

    // Convert to sorted array
    return Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/* ───────────── Multi-Scout Consensus ───────────── */

export interface ConsensusEntry {
  playerName: string;
  playerId: number | null;
  playerClub: string | null;
  playerClubLogoUrl: string | null;
  position: string | null;
  reportCount: number;
  scoutCount: number;
  avgRating: number | null;
  ratingSpread: number;
  /** 0-100 — how much scouts agree (100 = perfect, 0 = total disagreement) */
  agreementScore: number;
  /** Human-readable reasons for divergence */
  divergenceReasons: string[];
  /** true if ratingSpread >= 3 — suggests re-observation needed */
  needsReObservation: boolean;
  scouts: Array<{ name: string; rating: number | null; decision: string | null }>;
}

export async function getMultiScoutConsensus(): Promise<ConsensusEntry[]> {
  try {
    const { clubId } = await getActiveClub();
    const supabase = await createClient();

    // Fetch all reports — match by player name (not just player_id)
    const query = supabase
      .from('scouting_reports')
      .select('player_id, player_name_report, scout_name, rating, decision, team_report, position_report')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial']);

    const allRows = await fetchAllRows(query);

    // Fetch player club + position for linked players
    const playerIds = [...new Set(allRows.map((r) => r.player_id).filter(Boolean))] as number[];
    const playerInfoMap = new Map<number, { club: string | null; clubLogoUrl: string | null; position: string | null }>();
    // Batch player lookups in chunks of 200 to avoid URL length limits
    const CHUNK = 200;
    for (let i = 0; i < playerIds.length; i += CHUNK) {
      const chunk = playerIds.slice(i, i + CHUNK);
      const { data: players } = await supabase
        .from('players')
        .select('id, club, club_logo_url, position_normalized')
        .in('id', chunk);
      for (const p of players ?? []) {
        playerInfoMap.set(p.id as number, {
          club: p.club as string | null,
          clubLogoUrl: p.club_logo_url as string | null,
          position: p.position_normalized as string | null,
        });
      }
    }

    // Group by normalized player name (lowercase + trimmed)
    const playerMap = new Map<string, {
      displayName: string;
      playerId: number | null;
      playerClub: string | null;
      playerClubLogoUrl: string | null;
      position: string | null;
      reports: Array<{ scoutName: string; rating: number | null; decision: string | null }>;
    }>();

    for (const row of allRows) {
      const rawName = row.player_name_report as string | null;
      if (!rawName) continue;
      const key = rawName.toLowerCase().trim();
      const scoutName = (row.scout_name as string | null) ?? 'Desconhecido';

      if (!playerMap.has(key)) {
        playerMap.set(key, { displayName: rawName, playerId: null, playerClub: null, playerClubLogoUrl: null, position: null, reports: [] });
      }

      const entry = playerMap.get(key)!;
      // Resolve playerId + club/position from players table (authoritative source, always overwrite)
      if (!entry.playerId && row.player_id) {
        entry.playerId = row.player_id as number;
        const info = playerInfoMap.get(entry.playerId);
        if (info) {
          if (info.club) entry.playerClub = info.club;
          if (info.clubLogoUrl) entry.playerClubLogoUrl = info.clubLogoUrl;
          if (info.position) entry.position = info.position;
        }
      }
      // Fallback: use report club only when players table had nothing (position = players table only)
      if (!entry.playerClub && row.team_report) entry.playerClub = row.team_report as string;

      entry.reports.push({
        scoutName,
        rating: row.rating as number | null,
        decision: row.decision as string | null,
      });
    }

    const results: ConsensusEntry[] = [];

    for (const entry of playerMap.values()) {
      // Need 2+ reports from distinct scouts
      const distinctScouts = new Set(entry.reports.map((r) => r.scoutName));
      if (distinctScouts.size < 2) continue;

      const ratings = entry.reports.map((r) => r.rating).filter((r): r is number => r != null);
      const decisions = entry.reports.map((r) => r.decision).filter((d): d is string => d != null);

      // Rating spread (max - min)
      const ratingSpread = ratings.length >= 2 ? Math.max(...ratings) - Math.min(...ratings) : 0;

      // Average rating
      const avgRating = ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;

      // Agreement score (0-100):
      // Rating component: 50 pts — lose points per spread unit (spread 0=50, 1=40, 2=25, 3=10, 4=0)
      // Decision component: 50 pts — % of matching decisions
      let ratingScore = 50;
      if (ratings.length >= 2) {
        ratingScore = Math.max(0, 50 - ratingSpread * 15);
      }

      let decisionScore = 50;
      if (decisions.length >= 2) {
        const mostCommon = mode(decisions);
        const matchCount = decisions.filter((d) => d === mostCommon).length;
        decisionScore = Math.round((matchCount / decisions.length) * 50);
      }

      const agreementScore = ratingScore + decisionScore;

      // Build human-readable divergence reasons
      const divergenceReasons: string[] = [];
      if (ratings.length >= 2 && ratingSpread >= 2) {
        divergenceReasons.push(`Rating: ${Math.min(...ratings)} vs ${Math.max(...ratings)}`);
      }
      if (decisions.length >= 2) {
        const uniqueDecisions = [...new Set(decisions)];
        if (uniqueDecisions.length > 1) {
          divergenceReasons.push(`Decisão: ${uniqueDecisions.join(' vs ')}`);
        }
      }

      const needsReObservation = ratingSpread >= 3;

      // Deduplicate scouts — show one entry per scout (latest opinion)
      const scoutMap = new Map<string, { rating: number | null; decision: string | null }>();
      for (const r of entry.reports) {
        scoutMap.set(r.scoutName, { rating: r.rating, decision: r.decision });
      }

      results.push({
        playerName: entry.displayName,
        playerId: entry.playerId,
        playerClub: entry.playerClub,
        playerClubLogoUrl: entry.playerClubLogoUrl,
        position: entry.position,
        reportCount: entry.reports.length,
        scoutCount: distinctScouts.size,
        avgRating,
        ratingSpread,
        agreementScore,
        divergenceReasons,
        needsReObservation,
        scouts: Array.from(scoutMap.entries()).map(([name, data]) => ({
          name,
          rating: data.rating,
          decision: data.decision,
        })),
      });
    }

    // Sort: lowest agreement first (most interesting), then by report count
    results.sort((a, b) => {
      if (a.agreementScore !== b.agreementScore) return a.agreementScore - b.agreementScore;
      return b.reportCount - a.reportCount;
    });

    return results;
  } catch {
    return [];
  }
}

/** Returns the most frequent string in an array */
function mode(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) { best = val; bestCount = count; }
  }
  return best;
}

/* ───────────── Toggle Report Tag ───────────── */

const VALID_REPORT_TAGS = ['Prioritário', 'Rever', 'Contactar'] as const;

export async function toggleReportTag(
  reportId: number,
  tag: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { clubId, userId, role, isDemo } = await getActiveClub();
    if (isDemo) return { success: false, error: 'Modo demonstração — apenas leitura' };
    const supabase = await createClient();

    if (role !== 'admin' && role !== 'editor') {
      return { success: false, error: 'Sem permissão' };
    }

    if (!VALID_REPORT_TAGS.includes(tag as (typeof VALID_REPORT_TAGS)[number])) {
      return { success: false, error: `Tag inválida: ${tag}` };
    }

    // Fetch current tags
    const { data: report, error: fetchErr } = await supabase
      .from('scouting_reports')
      .select('admin_tags')
      .eq('id', reportId)
      .eq('club_id', clubId)
      .single();

    if (fetchErr || !report) return { success: false, error: 'Relatório não encontrado' };

    // Parse admin_tags — handle both JS array and Postgres string "{val1,val2}" formats
    let currentTags: string[] = [];
    const raw = report.admin_tags;
    if (Array.isArray(raw)) {
      currentTags = raw;
    } else if (typeof raw === 'string' && raw.startsWith('{')) {
      currentTags = raw.slice(1, -1).split(',').filter(Boolean);
    }

    // Toggle: remove if present, add if absent
    const tagIndex = currentTags.indexOf(tag);
    if (tagIndex !== -1) {
      currentTags.splice(tagIndex, 1);
    } else {
      currentTags.push(tag);
    }

    const { error: updateErr } = await supabase
      .from('scouting_reports')
      .update({ admin_tags: currentTags })
      .eq('id', reportId)
      .eq('club_id', clubId);

    if (updateErr) return { success: false, error: updateErr.message };

    revalidatePath('/admin/relatorios');
    await broadcastRowMutation(clubId, 'scouting_reports', 'UPDATE', userId, reportId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Distinct Scout Names ───────────── */

export async function getDistinctScoutNames(): Promise<string[]> {
  try {
    const { clubId } = await getActiveClub();
    const supabase = await createClient();

    const query = supabase
      .from('scouting_reports')
      .select('scout_name')
      .eq('club_id', clubId)
      .in('extraction_status', ['success', 'partial'])
      .not('scout_name', 'is', null);

    const allRows = await fetchAllRows(query);

    const names = new Set<string>();
    for (const row of allRows) {
      const name = row.scout_name as string;
      if (name) names.add(name);
    }

    return Array.from(names).sort();
  } catch {
    return [];
  }
}
