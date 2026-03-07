// src/actions/scout-reports.ts
// Server Actions for scout report submission, listing, and admin review
// Scouts submit reports via /submeter, admins review and create players or reject
// RELEVANT FILES: src/app/submeter/page.tsx, src/app/meus-relatorios/page.tsx, src/app/admin/relatorios/page.tsx

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { birthYearToAgeGroup, CURRENT_SEASON } from '@/lib/constants';

/* ───────────── Types ───────────── */

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

export interface ScoutReportRow {
  id: number;
  playerName: string;
  playerClub: string;
  fpfLink: string;
  zerozeroLink: string | null;
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
  nationality: string | null;
  birthCountry: string | null;
  height: number | null;
  weight: number | null;
  photoUrl: string | null;
  dob: string | null;
  secondaryPosition: string | null;
  tertiaryPosition: string | null;
  fpfPlayerId: string | null;
  zerozeroPlayerId: string | null;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  linkedPlayerId: number | null;
  authorName: string | null;
  createdAt: string;
}

/* ───────────── Row Mapper ───────────── */

function mapRow(r: Record<string, unknown>): ScoutReportRow {
  return {
    id: r.id as number,
    playerName: r.player_name as string,
    playerClub: r.player_club as string,
    fpfLink: r.fpf_link as string,
    zerozeroLink: r.zerozero_link as string | null,
    competition: r.competition as string | null,
    match: r.match as string | null,
    matchDate: r.match_date as string | null,
    matchResult: r.match_result as string | null,
    shirtNumber: r.shirt_number as string | null,
    birthYear: r.birth_year as string | null,
    foot: r.foot as string | null,
    position: r.position as string | null,
    physicalProfile: r.physical_profile as string | null,
    strengths: r.strengths as string | null,
    weaknesses: r.weaknesses as string | null,
    rating: r.rating as number | null,
    decision: r.decision as string | null,
    analysis: r.analysis as string | null,
    contactInfo: r.contact_info as string | null,
    nationality: r.nationality as string | null,
    birthCountry: r.birth_country as string | null,
    height: r.height as number | null,
    weight: r.weight as number | null,
    photoUrl: r.photo_url as string | null,
    dob: r.dob as string | null,
    secondaryPosition: r.secondary_position as string | null,
    tertiaryPosition: r.tertiary_position as string | null,
    fpfPlayerId: r.fpf_player_id as string | null,
    zerozeroPlayerId: r.zerozero_player_id as string | null,
    status: r.status as 'pendente' | 'aprovado' | 'rejeitado',
    linkedPlayerId: r.linked_player_id as number | null,
    authorName: (r.profiles as Record<string, unknown>)?.full_name as string | null ?? null,
    createdAt: r.created_at as string,
  };
}

/* ───────────── Submit Report ───────────── */

export async function submitScoutReport(
  input: ScoutReportInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Não autenticado' };

    // Validate required fields
    if (!input.playerName.trim()) return { success: false, error: 'Nome do jogador é obrigatório' };
    if (!input.playerClub.trim()) return { success: false, error: 'Clube é obrigatório' };
    if (!input.fpfLink.trim()) return { success: false, error: 'Link FPF é obrigatório' };

    const { error } = await supabase
      .from('scout_reports')
      .insert({
        author_id: user.id,
        player_name: input.playerName.trim(),
        player_club: input.playerClub.trim(),
        fpf_link: input.fpfLink.trim(),
        zerozero_link: input.zerozeroLink?.trim() || null,
        competition: input.competition?.trim() || null,
        match: input.match?.trim() || null,
        match_date: input.matchDate || null,
        match_result: input.matchResult?.trim() || null,
        shirt_number: input.shirtNumber?.trim() || null,
        birth_year: input.birthYear?.trim() || null,
        foot: input.foot || null,
        position: input.position || null,
        physical_profile: input.physicalProfile?.trim() || null,
        strengths: input.strengths?.trim() || null,
        weaknesses: input.weaknesses?.trim() || null,
        rating: input.rating || null,
        decision: input.decision?.trim() || null,
        analysis: input.analysis?.trim() || null,
        contact_info: input.contactInfo?.trim() || null,
        nationality: input.nationality?.trim() || null,
        birth_country: input.birthCountry?.trim() || null,
        height: input.height || null,
        weight: input.weight || null,
        photo_url: input.photoUrl?.trim() || null,
        dob: input.dob || null,
        secondary_position: input.secondaryPosition || null,
        tertiary_position: input.tertiaryPosition || null,
        fpf_player_id: input.fpfPlayerId?.trim() || null,
        zerozero_player_id: input.zerozeroPlayerId?.trim() || null,
      });

    if (error) return { success: false, error: error.message };

    revalidatePath('/meus-relatorios');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── List My Reports (Scout) ───────────── */

export async function listMyScoutReports(): Promise<{ success: boolean; reports: ScoutReportRow[]; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, reports: [], error: 'Não autenticado' };

    const { data, error } = await supabase
      .from('scout_reports')
      .select('*, profiles:author_id(full_name)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return { success: false, reports: [], error: error.message };
    return { success: true, reports: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)) };
  } catch (e) {
    return { success: false, reports: [], error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Get Single Report ───────────── */

export async function getScoutReport(id: number): Promise<{ report: ScoutReportRow | null; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { report: null, error: 'Não autenticado' };

    // Scout sees own reports; admin/editor sees all
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdminOrEditor = profile?.role === 'admin' || profile?.role === 'editor';

    let query = supabase.from('scout_reports').select('*, profiles:author_id(full_name)').eq('id', id);
    if (!isAdminOrEditor) query = query.eq('author_id', user.id);

    const { data, error } = await query.single();
    if (error || !data) return { report: null, error: error?.message || 'Relatório não encontrado' };

    return { report: mapRow(data as Record<string, unknown>) };
  } catch (e) {
    return { report: null, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── List All Reports (Admin/Editor) ───────────── */

export async function listAllScoutReports(
  statusFilter?: 'pendente' | 'aprovado' | 'rejeitado',
): Promise<{ success: boolean; reports: ScoutReportRow[]; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, reports: [], error: 'Não autenticado' };

    // Verify admin/editor role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin' && profile?.role !== 'editor') {
      return { success: false, reports: [], error: 'Sem permissão' };
    }

    let query = supabase
      .from('scout_reports')
      .select('*, profiles:author_id(full_name)')
      .order('created_at', { ascending: false });

    if (statusFilter) query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) return { success: false, reports: [], error: error.message };
    return { success: true, reports: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)) };
  } catch (e) {
    return { success: false, reports: [], error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Pending Count (for sidebar badge) ───────────── */

export async function getPendingReportsCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from('scout_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente');
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Não autenticado' };

    // Verify admin/editor
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin' && profile?.role !== 'editor') {
      return { success: false, error: 'Sem permissão' };
    }

    // Fetch the report
    const { data: report, error: fetchErr } = await supabase
      .from('scout_reports').select('*').eq('id', reportId).single();
    if (fetchErr || !report) return { success: false, error: 'Relatório não encontrado' };
    if (report.status !== 'pendente') return { success: false, error: 'Relatório já foi processado' };

    const r = report as Record<string, unknown>;

    // Check for duplicate player by FPF link
    const fpfLink = r.fpf_link as string;
    if (fpfLink) {
      const { data: existing } = await supabase
        .from('players').select('id, name').eq('fpf_link', fpfLink).maybeSingle();
      if (existing) {
        // Link to existing player instead of creating new one
        await supabase.from('scout_reports').update({
          status: 'aprovado',
          linked_player_id: existing.id,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        }).eq('id', reportId);

        // Save scout evaluation as observation note on existing player
        await saveEvalAsNote(supabase, existing.id, r);

        revalidatePath('/admin/relatorios');
        revalidatePath('/meus-relatorios');
        revalidatePath(`/jogadores/${existing.id}`);
        return { success: true, playerId: existing.id };
      }
    }

    // Determine age group from DOB or birthYear
    const dob = r.dob as string | null;
    const birthYear = dob
      ? new Date(dob).getFullYear()
      : (r.birth_year as string | null) ? parseInt(r.birth_year as string, 10) : null;

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
        .insert({ name: ageGroupName, generation_year: birthYear, season: CURRENT_SEASON })
        .select('id').single();
      if (agErr) return { success: false, error: `Erro ao criar escalão: ${agErr.message}` };
      ageGroup = newAg;
    }

    // Create the player
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .insert({
        age_group_id: ageGroup!.id,
        name: r.player_name as string,
        dob: dob || null,
        club: r.player_club as string,
        position_normalized: r.position as string | null,
        secondary_position: r.secondary_position as string | null,
        tertiary_position: r.tertiary_position as string | null,
        foot: r.foot as string | null,
        shirt_number: r.shirt_number as string | null,
        contact: r.contact_info as string | null,
        fpf_link: fpfLink || null,
        fpf_player_id: r.fpf_player_id as string | null,
        zerozero_link: r.zerozero_link as string | null,
        zerozero_player_id: r.zerozero_player_id as string | null,
        photo_url: r.photo_url as string | null,
        height: r.height as number | null,
        weight: r.weight as number | null,
        nationality: r.nationality as string | null,
        birth_country: r.birth_country as string | null,
        department_opinion: r.decision ? [r.decision as string] : ['Por Observar'],
        observer_decision: r.decision as string | null,
        referred_by: (report as Record<string, unknown>).author_id ? 'Scout' : null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (playerErr) return { success: false, error: `Erro ao criar jogador: ${playerErr.message}` };

    // Update report status and link to player
    await supabase.from('scout_reports').update({
      status: 'aprovado',
      linked_player_id: player!.id,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', reportId);

    // Save evaluation as observation note on the new player
    await saveEvalAsNote(supabase, player!.id, r);

    revalidatePath('/admin/relatorios');
    revalidatePath('/meus-relatorios');
    revalidatePath('/jogadores');
    return { success: true, playerId: player!.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Reject Report ───────────── */

export async function rejectScoutReport(reportId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Não autenticado' };

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin' && profile?.role !== 'editor') {
      return { success: false, error: 'Sem permissão' };
    }

    const { error } = await supabase.from('scout_reports').update({
      status: 'rejeitado',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', reportId).eq('status', 'pendente');

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/relatorios');
    revalidatePath('/meus-relatorios');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Helper: Save scout evaluation as observation note ───────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveEvalAsNote(supabase: any, playerId: number, r: Record<string, unknown>) {
  const parts: string[] = [];
  if (r.rating) parts.push(`Avaliação: ${r.rating}/5`);
  if (r.decision) parts.push(`Decisão: ${r.decision}`);
  if (r.physical_profile) parts.push(`Perfil físico: ${r.physical_profile}`);
  if (r.strengths) parts.push(`Pontos fortes: ${r.strengths}`);
  if (r.weaknesses) parts.push(`Pontos fracos: ${r.weaknesses}`);
  if (r.match) parts.push(`Jogo: ${r.match}`);
  if (r.match_date) parts.push(`Data: ${new Date(r.match_date as string).toLocaleDateString('pt-PT')}`);
  if (r.match_result) parts.push(`Resultado: ${r.match_result}`);
  if (r.competition) parts.push(`Competição: ${r.competition}`);

  if (parts.length > 0) {
    await supabase.from('observation_notes').insert({
      player_id: playerId,
      author_id: r.author_id as string,
      content: parts.join('\n'),
    });
  }
}
