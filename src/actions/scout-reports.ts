// src/actions/scout-reports.ts
// Server Actions for scout report submission and listing
// Scouts submit reports via /submeter, admins review and link to players
// RELEVANT FILES: src/app/submeter/page.tsx, src/app/meus-relatorios/page.tsx, supabase/migrations/024_scout_reports.sql

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
  createdAt: string;
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

/* ───────────── List My Reports ───────────── */

export async function listMyScoutReports(): Promise<{ success: boolean; reports: ScoutReportRow[]; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, reports: [], error: 'Não autenticado' };

    const { data, error } = await supabase
      .from('scout_reports')
      .select('*')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return { success: false, reports: [], error: error.message };

    const reports: ScoutReportRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
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
      createdAt: r.created_at as string,
    }));

    return { success: true, reports };
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

    const { data, error } = await supabase
      .from('scout_reports')
      .select('*')
      .eq('id', id)
      .eq('author_id', user.id)
      .single();

    if (error || !data) return { report: null, error: error?.message || 'Relatório não encontrado' };

    const r = data as Record<string, unknown>;
    const report: ScoutReportRow = {
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
      createdAt: r.created_at as string,
    };

    return { report };
  } catch (e) {
    return { report: null, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}
