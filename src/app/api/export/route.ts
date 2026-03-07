// src/app/api/export/route.ts
// API route to export players as Excel (.xlsx) file with optional filters
// Streams the file as a download — admin/editor only
// RELEVANT FILES: src/app/exportar/page.tsx, src/lib/supabase/server.ts, src/lib/types/index.ts

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';

// ExcelJS needs Node.js runtime (uses streams/Buffer)
export const runtime = 'nodejs';

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

/* ───────────── Route Handler ───────────── */

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Auth check — admin/editor only
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && profile?.role !== 'editor') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  // Parse filters from query params
  const params = req.nextUrl.searchParams;
  const ageGroupId = params.get('ageGroupId');
  const position = params.get('position');
  const club = params.get('club');
  const foot = params.get('foot');
  const opinion = params.get('opinion');
  const status = params.get('status');
  const realSquad = params.get('realSquad');
  const shadowSquad = params.get('shadowSquad');

  // Build query
  let query = supabase
    .from('players')
    .select('*, age_groups(name)')
    .order('name');

  if (ageGroupId && ageGroupId !== 'all') query = query.eq('age_group_id', parseInt(ageGroupId, 10));
  if (position) query = query.eq('position_normalized', position);
  if (club) query = query.eq('club', club);
  if (foot) query = query.eq('foot', foot);
  if (status) query = query.eq('recruitment_status', status);
  if (realSquad === 'yes') query = query.eq('is_real_squad', true);
  if (realSquad === 'no') query = query.eq('is_real_squad', false);
  if (shadowSquad === 'yes') query = query.eq('is_shadow_squad', true);
  if (shadowSquad === 'no') query = query.eq('is_shadow_squad', false);

  const { data: players, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter by opinion client-side (it's a postgres array, harder to filter in query)
  let rows = (players ?? []) as Record<string, unknown>[];
  if (opinion) {
    rows = rows.filter((r) => {
      const raw = r.department_opinion;
      const arr: string[] | null = Array.isArray(raw)
        ? raw
        : typeof raw === 'string' && raw.startsWith('{')
          ? raw.slice(1, -1).split(',').map((s: string) => s.replace(/^"|"$/g, ''))
          : null;
      return arr?.includes(opinion);
    });
  }

  // Build Excel workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Eskout';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Jogadores');
  sheet.columns = COLUMNS;

  // Style header row
  sheet.getRow(1).font = { bold: true, size: 11 };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A1A1A' },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

  // Add data rows
  for (const r of rows) {
    const rawOpinions = r.department_opinion;
    const opinions: string[] | null = Array.isArray(rawOpinions)
      ? rawOpinions
      : typeof rawOpinions === 'string' && rawOpinions.startsWith('{')
        ? rawOpinions.slice(1, -1).split(',').map((s: string) => s.replace(/^"|"$/g, ''))
        : null;
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

  // Auto-filter on header row
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Build filename
  const ageGroupName = ageGroupId && ageGroupId !== 'all' && rows.length > 0
    ? ((rows[0] as Record<string, unknown>).age_groups as Record<string, unknown>)?.name ?? 'todos'
    : 'todos';
  const date = new Date().toISOString().slice(0, 10);
  const filename = `eskout_${ageGroupName}_${date}.xlsx`;

  return new NextResponse(Buffer.from(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
