// src/lib/utils/activity-labels.ts
// Pure formatting helpers for activity timeline display — dates, booleans, status labels
// Shared between master-activity server action and OnlinePageClient
// RELEVANT FILES: src/actions/master-activity.ts, src/app/master/online/OnlinePageClient.tsx, src/components/players/StatusHistory.tsx

import { RECRUITMENT_LABEL_MAP, POSITION_LABELS } from '@/lib/constants';
import type { PositionCode } from '@/lib/types';

/* ───────────── Field Classification ───────────── */

/** Fields whose old_value/new_value are ISO date strings */
export const DATE_FIELDS = new Set(['training_date', 'meeting_date', 'signing_date', 'decision_date']);

/** Fields whose values are booleans stored as strings */
export const BOOLEAN_FIELDS = new Set(['is_shadow_squad', 'is_real_squad']);

/** Fields whose values are position codes (DC, MC, ED, etc.) */
const POSITION_FIELDS = new Set(['shadow_position', 'real_squad_position', 'position_normalized']);

/** DC sub-slot labels for squad positions */
const SLOT_LABELS: Record<string, string> = {
  DC_E: 'Defesa Central (E)',
  DC_D: 'Defesa Central (D)',
};

/* ───────────── Formatters ───────────── */

/** Format an ISO date string to "dd/MM/yyyy, HH:mm" in Portuguese.
 *  Uses string slicing to avoid timezone conversion — pipeline dates are wall-clock values. */
export function formatDateStr(isoStr: string): string {
  try {
    const datePart = isoStr.slice(0, 10);
    const [year, month, day] = datePart.split('-').map(Number);
    if (!year || !month || !day) return isoStr;
    const timePart = isoStr.length > 10 && isoStr.includes('T') ? isoStr.slice(11, 16) : null;
    const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    return timePart && timePart !== '00:00' ? `${date}, ${timePart}` : date;
  } catch {
    return isoStr;
  }
}

/** Format a field value for human-readable display based on field type */
export function formatFieldValue(field: string, value: string | null): string {
  if (!value) return '(vazio)';

  // Date fields → readable date
  if (DATE_FIELDS.has(field)) return formatDateStr(value);

  // Boolean fields → Sim/Não
  if (BOOLEAN_FIELDS.has(field)) {
    if (value === 'true') return 'Sim';
    if (value === 'false') return 'Não';
  }

  // Recruitment status → Portuguese label
  if (field === 'recruitment_status') {
    return RECRUITMENT_LABEL_MAP[value as keyof typeof RECRUITMENT_LABEL_MAP] ?? value;
  }

  // Department opinion → parse JSON array to comma-separated string
  if (field === 'department_opinion') {
    return parseOpinionValue(value);
  }

  // Decision side → readable label
  if (field === 'decision_side') {
    if (value === 'club') return 'Clube';
    if (value === 'player') return 'Jogador';
  }

  // Position codes → Portuguese label
  if (POSITION_FIELDS.has(field)) {
    return POSITION_LABELS[value as PositionCode] ?? SLOT_LABELS[value] ?? value;
  }

  return value;
}

/** Parse department opinion value — handles JSON arrays, Postgres arrays, and plain strings */
export function parseOpinionValue(value: string): string {
  // JSON array: ["Por Observar","Acompanhar"]
  if (value.startsWith('[')) {
    try {
      const arr = JSON.parse(value) as string[];
      if (Array.isArray(arr)) return arr.filter(Boolean).join(', ');
    } catch { /* not JSON, fall through */ }
  }
  // Postgres array: {Por Observar,Acompanhar}
  if (value.startsWith('{') && value.endsWith('}')) {
    return value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).join(', ');
  }
  return value;
}

/* ───────────── Activity Description Builders ───────────── */

/** Check if a status_history entry represents adding to pipeline (null → any status) */
export function isPipelineAdd(oldValue: string | null, newValue: string | null): boolean {
  return !oldValue && !!newValue;
}

/** Check if a status_history entry represents removing from pipeline (value → null) */
export function isPipelineRemove(field: string, oldValue: string | null, newValue: string | null): boolean {
  return field === 'recruitment_status' && !!oldValue && !newValue;
}

/** Build squad label from status_history notes (e.g. "Sub-14 Real" → "Plantel - Sub-14") */
export function buildSquadLabel(field: string, notes: string | null): string {
  const squadMatch = notes?.match(/"([^"]+)"/);
  const squadName = squadMatch?.[1];
  const escalaoMatch = squadName?.match(/(Sub-\d+)/i);
  const escalao = escalaoMatch?.[1] ?? null;
  const typeLabel = field === 'is_real_squad' ? 'Plantel' : 'Plantel Sombra';
  return escalao ? `${typeLabel} - ${escalao}` : typeLabel;
}
