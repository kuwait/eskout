// src/actions/export.ts
// Server Actions for Excel and PDF export of players with optional filters
// Excel returns base64-encoded xlsx; PDF data returns JSON rows for client-side jsPDF
// RELEVANT FILES: src/app/exportar/ExportForm.tsx, src/lib/supabase/server.ts, src/lib/supabase/club-context.ts

'use server';

import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';

/* ───────────── Column Definitions ───────────── */

const COLUMNS: { header: string; key: string; width: number }[] = [
  { header: 'Nome', key: 'name', width: 30 },
  { header: 'Clube', key: 'club', width: 20 },
  { header: 'Posição', key: 'position', width: 10 },
  { header: 'Pos. 2', key: 'secondary_position', width: 10 },
  { header: 'Pos. 3', key: 'tertiary_position', width: 10 },
  { header: 'Pé', key: 'foot', width: 6 },
  { header: 'Nascimento', key: 'dob', width: 12 },
  { header: 'Nº Camisola', key: 'shirt_number', width: 10 },
  { header: 'Nacionalidade', key: 'nationality', width: 15 },
  { header: 'País Nascimento', key: 'birth_country', width: 15 },
  { header: 'Altura', key: 'height', width: 8 },
  { header: 'Peso', key: 'weight', width: 8 },
  { header: 'Opinião Dep.', key: 'department_opinion', width: 18 },
  { header: 'Decisão Obs.', key: 'observer_decision', width: 15 },
  { header: 'Observador', key: 'observer', width: 18 },
  { header: 'Referido por', key: 'referred_by', width: 15 },
  { header: 'Estado Pipeline', key: 'recruitment_status', width: 15 },
  { header: 'Plantel Real', key: 'is_real_squad', width: 10 },
  { header: 'Plantel Sombra', key: 'is_shadow_squad', width: 12 },
  { header: 'Pos. Sombra', key: 'shadow_position', width: 10 },
  { header: 'Contacto', key: 'contact', width: 15 },
  { header: 'Link FPF', key: 'fpf_link', width: 35 },
  { header: 'Link ZeroZero', key: 'zerozero_link', width: 35 },
  { header: 'Notas', key: 'notes', width: 30 },
];

/* ───────────── JSON Full DB Export ───────────── */

const ALL_TABLES = [
  'players',
  'age_groups',
  'profiles',
  'observation_notes',
  'scouting_reports',
  'status_history',
  'calendar_events',
  'scout_reports',
  'scout_evaluations',
] as const;

// Fetch all rows from a table, paginating past the 1000-row limit, scoped to club
async function fetchAllRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  clubId: string,
): Promise<Record<string, unknown>[]> {
  const PAGE_SIZE = 1000;
  let all: Record<string, unknown>[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    // profiles table doesn't have club_id — skip club filter for it
    const hasClubId = table !== 'profiles';
    let query = supabase
      .from(table)
      .select('*')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (hasClubId) query = query.eq('club_id', clubId);

    const { data } = await query;

    const rows = (data ?? []) as Record<string, unknown>[];
    all = all.concat(rows);
    hasMore = rows.length === PAGE_SIZE;
    page++;
  }
  return all;
}

export async function exportFullDatabaseJson(): Promise<{
  success: boolean; data?: string; filename?: string; error?: string;
}> {
  try {
    const { error: authError, supabase, clubId } = await checkExportAuth();
    if (authError) return { success: false, error: authError };

    // Fetch all tables in parallel
    const results = await Promise.all(
      ALL_TABLES.map(async (table) => ({
        table,
        rows: await fetchAllRows(supabase, table, clubId),
      })),
    );

    // Build { tableName: rows[] } object
    const db: Record<string, Record<string, unknown>[]> = {};
    for (const { table, rows } of results) {
      db[table] = rows;
    }

    const json = JSON.stringify(db, null, 2);
    const base64 = Buffer.from(json, 'utf-8').toString('base64');

    const date = new Date().toISOString().slice(0, 10);
    const filename = `eskout_backup_${date}.json`;

    return { success: true, data: base64, filename };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── PDF Column subset (fits landscape A4) ───────────── */

/* ───────────── Shared Types ───────────── */

export interface ExportFilters {
  ageGroupId?: string;
  position?: string;
  club?: string;
  foot?: string;
  opinion?: string;
  status?: string;
  realSquad?: string;
  shadowSquad?: string;
}

/* ───────────── Helpers ───────────── */

// Parse postgres array that may come as string "{val1,val2}" or JS array
function parsePostgresArray(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.startsWith('{')) {
    return raw.slice(1, -1).split(',').map((s: string) => s.replace(/^"|"$/g, ''));
  }
  return null;
}

// Auth check — admin/editor only, returns clubId for downstream queries
async function checkExportAuth() {
  const { clubId, role } = await getActiveClub();
  const supabase = await createClient();

  if (role !== 'admin' && role !== 'editor') {
    return { error: 'Sem permissão' as const, supabase, clubId };
  }
  return { error: null, supabase, clubId };
}

// Fetch all players matching filters (paginates to bypass 1000-row limit), scoped to club
async function fetchFilteredPlayers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters: ExportFilters,
  clubId: string,
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const PAGE_SIZE = 1000;
  let allPlayers: Record<string, unknown>[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('players')
      .select('*, age_groups(name)')
      .eq('club_id', clubId)
      .order('name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filters.ageGroupId && filters.ageGroupId !== 'all') {
      query = query.eq('age_group_id', parseInt(filters.ageGroupId, 10));
    }
    if (filters.position) query = query.eq('position_normalized', filters.position);
    if (filters.club) query = query.eq('club', filters.club);
    if (filters.foot) query = query.eq('foot', filters.foot);
    if (filters.status) query = query.eq('recruitment_status', filters.status);
    if (filters.realSquad === 'yes') query = query.eq('is_real_squad', true);
    if (filters.realSquad === 'no') query = query.eq('is_real_squad', false);
    if (filters.shadowSquad === 'yes') query = query.eq('is_shadow_squad', true);
    if (filters.shadowSquad === 'no') query = query.eq('is_shadow_squad', false);

    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };

    const rows = (data ?? []) as Record<string, unknown>[];
    allPlayers = allPlayers.concat(rows);
    hasMore = rows.length === PAGE_SIZE;
    page++;
  }

  // Filter by opinion in JS (postgres array harder to filter in query)
  if (filters.opinion) {
    allPlayers = allPlayers.filter((r) => {
      const arr = parsePostgresArray(r.department_opinion);
      return arr?.includes(filters.opinion!);
    });
  }

  return { rows: allPlayers };
}

// Build age group label for filename
function getAgeGroupLabel(filters: ExportFilters, rows: Record<string, unknown>[]): string {
  if (filters.ageGroupId && filters.ageGroupId !== 'all' && rows.length > 0) {
    return ((rows[0] as Record<string, unknown>).age_groups as Record<string, unknown>)?.name as string ?? 'todos';
  }
  return 'todos';
}

/* ───────────── Excel Export ───────────── */

export async function exportPlayersExcel(
  filters: ExportFilters,
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
  try {
    const { error: authError, supabase, clubId } = await checkExportAuth();
    if (authError) return { success: false, error: authError };

    const { rows, error } = await fetchFilteredPlayers(supabase, filters, clubId);
    if (error) return { success: false, error };

    // Build Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Eskout';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Jogadores');
    sheet.columns = COLUMNS;

    // Style header row
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A1A1A' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    // Add data rows
    for (const r of rows) {
      const opinions = parsePostgresArray(r.department_opinion);
      sheet.addRow({
        name: r.name,
        club: r.club,
        position: r.position_normalized,
        secondary_position: r.secondary_position,
        tertiary_position: r.tertiary_position,
        foot: r.foot,
        dob: r.dob ? new Date(r.dob as string).toLocaleDateString('pt-PT') : '',
        shirt_number: r.shirt_number,
        nationality: r.nationality,
        birth_country: r.birth_country,
        height: r.height ?? '',
        weight: r.weight ?? '',
        department_opinion: opinions?.join(', ') ?? '',
        observer_decision: r.observer_decision,
        observer: r.observer,
        referred_by: r.referred_by,
        recruitment_status: r.recruitment_status,
        is_real_squad: r.is_real_squad ? 'Sim' : 'Não',
        is_shadow_squad: r.is_shadow_squad ? 'Sim' : 'Não',
        shadow_position: r.shadow_position,
        contact: r.contact,
        fpf_link: r.fpf_link,
        zerozero_link: r.zerozero_link,
        notes: r.notes,
      });
    }

    // Auto-filter
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: COLUMNS.length },
    };

    // Generate buffer → base64
    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64');

    const ageGroupLabel = getAgeGroupLabel(filters, rows);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `eskout_${ageGroupLabel}_${date}.xlsx`;

    return { success: true, data: base64, filename };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── PDF Data Export ───────────── */

// Returns formatted rows for client-side jsPDF generation
export interface PdfRow {
  name: string;
  club: string;
  position: string;
  secondary_position: string;
  tertiary_position: string;
  foot: string;
  dob: string;
  shirt_number: string;
  nationality: string;
  birth_country: string;
  height: string;
  weight: string;
  department_opinion: string;
  observer_decision: string;
  observer: string;
  referred_by: string;
  recruitment_status: string;
  is_real_squad: string;
  is_shadow_squad: string;
  shadow_position: string;
  contact: string;
  notes: string;
}

export async function exportPlayersPdfData(
  filters: ExportFilters,
): Promise<{ success: boolean; rows?: PdfRow[]; filename?: string; total?: number; error?: string }> {
  try {
    const { error: authError, supabase, clubId } = await checkExportAuth();
    if (authError) return { success: false, error: authError };

    const { rows, error } = await fetchFilteredPlayers(supabase, filters, clubId);
    if (error) return { success: false, error };

    // Map to PDF-friendly flat rows (all columns)
    const pdfRows: PdfRow[] = rows.map((r) => {
      const opinions = parsePostgresArray(r.department_opinion);
      return {
        name: (r.name as string) ?? '',
        club: (r.club as string) ?? '',
        position: (r.position_normalized as string) ?? '',
        secondary_position: (r.secondary_position as string) ?? '',
        tertiary_position: (r.tertiary_position as string) ?? '',
        foot: (r.foot as string) ?? '',
        dob: r.dob ? new Date(r.dob as string).toLocaleDateString('pt-PT') : '',
        shirt_number: r.shirt_number ? String(r.shirt_number) : '',
        nationality: (r.nationality as string) ?? '',
        birth_country: (r.birth_country as string) ?? '',
        height: r.height ? String(r.height) : '',
        weight: r.weight ? String(r.weight) : '',
        department_opinion: opinions?.join(', ') ?? '',
        observer_decision: (r.observer_decision as string) ?? '',
        observer: (r.observer as string) ?? '',
        referred_by: (r.referred_by as string) ?? '',
        recruitment_status: (r.recruitment_status as string) ?? '',
        is_real_squad: r.is_real_squad ? 'Sim' : 'Não',
        is_shadow_squad: r.is_shadow_squad ? 'Sim' : 'Não',
        shadow_position: (r.shadow_position as string) ?? '',
        contact: (r.contact as string) ?? '',
        notes: (r.notes as string) ?? '',
      };
    });

    const ageGroupLabel = getAgeGroupLabel(filters, rows);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `eskout_${ageGroupLabel}_${date}.pdf`;

    return { success: true, rows: pdfRows, filename, total: pdfRows.length };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}
