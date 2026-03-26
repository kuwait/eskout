// src/lib/utils/__tests__/activity-labels.test.ts
// Tests for activity timeline formatting helpers — dates, booleans, status labels, squad labels
// Ensures human-readable display for status_history entries
// RELEVANT FILES: src/lib/utils/activity-labels.ts, src/actions/master-activity.ts, src/app/master/online/OnlinePageClient.tsx

import {
  DATE_FIELDS,
  BOOLEAN_FIELDS,
  formatDateStr,
  formatFieldValue,
  parseOpinionValue,
  isPipelineAdd,
  isPipelineRemove,
  buildSquadLabel,
} from '@/lib/utils/activity-labels';

/* ───────────── Field Classification ───────────── */

describe('DATE_FIELDS', () => {
  it('includes training_date, meeting_date, signing_date, decision_date', () => {
    expect(DATE_FIELDS.has('training_date')).toBe(true);
    expect(DATE_FIELDS.has('meeting_date')).toBe(true);
    expect(DATE_FIELDS.has('signing_date')).toBe(true);
    expect(DATE_FIELDS.has('decision_date')).toBe(true);
  });

  it('excludes non-date fields', () => {
    expect(DATE_FIELDS.has('recruitment_status')).toBe(false);
    expect(DATE_FIELDS.has('club')).toBe(false);
  });
});

describe('BOOLEAN_FIELDS', () => {
  it('includes is_shadow_squad, is_real_squad', () => {
    expect(BOOLEAN_FIELDS.has('is_shadow_squad')).toBe(true);
    expect(BOOLEAN_FIELDS.has('is_real_squad')).toBe(true);
  });

  it('excludes non-boolean fields', () => {
    expect(BOOLEAN_FIELDS.has('recruitment_status')).toBe(false);
  });
});

/* ───────────── formatDateStr ───────────── */

describe('formatDateStr', () => {
  it('formats ISO date to Portuguese locale', () => {
    const result = formatDateStr('2026-03-19T19:30:00+00:00');
    // Should contain day/month/year and time
    expect(result).toMatch(/19\/03\/2026/);
    expect(result).toMatch(/19:30/);
  });

  it('returns original string for invalid dates', () => {
    expect(formatDateStr('not-a-date')).toBe('not-a-date');
  });

  it('handles dates without timezone', () => {
    const result = formatDateStr('2026-03-19T10:00:00');
    expect(result).toMatch(/19\/03\/2026/);
    expect(result).toMatch(/10:00/);
  });
});

/* ───────────── formatFieldValue ───────────── */

describe('formatFieldValue', () => {
  it('returns "(vazio)" for null values', () => {
    expect(formatFieldValue('recruitment_status', null)).toBe('(vazio)');
    expect(formatFieldValue('training_date', null)).toBe('(vazio)');
    expect(formatFieldValue('is_real_squad', null)).toBe('(vazio)');
  });

  it('formats date fields as readable dates', () => {
    const result = formatFieldValue('training_date', '2026-03-19T19:30:00+00:00');
    expect(result).toMatch(/19\/03\/2026/);
    expect(result).toMatch(/19:30/);
  });

  it('formats meeting_date as readable date', () => {
    const result = formatFieldValue('meeting_date', '2026-04-01T14:00:00');
    expect(result).toMatch(/01\/04\/2026/);
    expect(result).toMatch(/14:00/);
  });

  it('formats signing_date as readable date', () => {
    const result = formatFieldValue('signing_date', '2026-05-15T09:00:00');
    expect(result).toMatch(/15\/05\/2026/);
  });

  it('formats boolean "true" as "Sim"', () => {
    expect(formatFieldValue('is_real_squad', 'true')).toBe('Sim');
    expect(formatFieldValue('is_shadow_squad', 'true')).toBe('Sim');
  });

  it('formats boolean "false" as "Não"', () => {
    expect(formatFieldValue('is_real_squad', 'false')).toBe('Não');
    expect(formatFieldValue('is_shadow_squad', 'false')).toBe('Não');
  });

  it('formats recruitment_status with Portuguese labels', () => {
    expect(formatFieldValue('recruitment_status', 'por_tratar')).toBe('Por tratar');
    expect(formatFieldValue('recruitment_status', 'em_contacto')).toBe('Em contacto');
    expect(formatFieldValue('recruitment_status', 'vir_treinar')).toBe('Vir treinar');
    expect(formatFieldValue('recruitment_status', 'reuniao_marcada')).toBe('Reunião Marcada');
    expect(formatFieldValue('recruitment_status', 'a_decidir')).toBe('A decidir');
    expect(formatFieldValue('recruitment_status', 'em_standby')).toBe('Em Stand-by');
    expect(formatFieldValue('recruitment_status', 'confirmado')).toBe('Confirmado');
    expect(formatFieldValue('recruitment_status', 'assinou')).toBe('Assinou');
    expect(formatFieldValue('recruitment_status', 'rejeitado')).toBe('Recusou vir');
  });

  it('falls back to raw value for unknown recruitment_status', () => {
    expect(formatFieldValue('recruitment_status', 'unknown_status')).toBe('unknown_status');
  });

  it('formats decision_date as readable date', () => {
    const result = formatFieldValue('decision_date', '2026-03-01T10:00:00');
    expect(result).toMatch(/01\/03\/2026/);
    expect(result).toMatch(/10:00/);
  });

  it('formats department_opinion JSON array to comma-separated', () => {
    expect(formatFieldValue('department_opinion', '["Por Observar","Acompanhar"]'))
      .toBe('Por Observar, Acompanhar');
  });

  it('formats department_opinion single value', () => {
    expect(formatFieldValue('department_opinion', '["1ª Escolha"]'))
      .toBe('1ª Escolha');
  });

  it('formats department_opinion Postgres array', () => {
    expect(formatFieldValue('department_opinion', '{Por Observar,Acompanhar}'))
      .toBe('Por Observar, Acompanhar');
  });

  it('formats department_opinion plain string', () => {
    expect(formatFieldValue('department_opinion', 'Acompanhar'))
      .toBe('Acompanhar');
  });

  it('formats decision_side club as "Clube"', () => {
    expect(formatFieldValue('decision_side', 'club')).toBe('Clube');
  });

  it('formats decision_side player as "Jogador"', () => {
    expect(formatFieldValue('decision_side', 'player')).toBe('Jogador');
  });

  it('formats position codes to Portuguese labels', () => {
    expect(formatFieldValue('shadow_position', 'DC')).toBe('Defesa Central');
    expect(formatFieldValue('real_squad_position', 'ED')).toBe('Extremo Direito');
    expect(formatFieldValue('position_normalized', 'GR')).toBe('Guarda-Redes');
    expect(formatFieldValue('shadow_position', 'PL')).toBe('Ponta de Lança');
  });

  it('formats DC sub-slots', () => {
    expect(formatFieldValue('real_squad_position', 'DC_E')).toBe('Defesa Central (E)');
    expect(formatFieldValue('real_squad_position', 'DC_D')).toBe('Defesa Central (D)');
  });

  it('returns raw value for unhandled fields', () => {
    expect(formatFieldValue('club', 'FC Porto')).toBe('FC Porto');
    expect(formatFieldValue('observer_decision', 'Assinar')).toBe('Assinar');
  });
});

/* ───────────── parseOpinionValue ───────────── */

describe('parseOpinionValue', () => {
  it('parses JSON array', () => {
    expect(parseOpinionValue('["Por Observar","Acompanhar"]')).toBe('Por Observar, Acompanhar');
  });

  it('parses single-element JSON array', () => {
    expect(parseOpinionValue('["1ª Escolha"]')).toBe('1ª Escolha');
  });

  it('parses Postgres array format', () => {
    expect(parseOpinionValue('{Por Observar,Acompanhar}')).toBe('Por Observar, Acompanhar');
  });

  it('returns plain string as-is', () => {
    expect(parseOpinionValue('Acompanhar')).toBe('Acompanhar');
  });

  it('filters empty entries from JSON array', () => {
    expect(parseOpinionValue('["Por Observar","","Acompanhar"]')).toBe('Por Observar, Acompanhar');
  });
});

/* ───────────── isPipelineAdd ───────────── */

describe('isPipelineAdd', () => {
  it('returns true when null → por_tratar', () => {
    expect(isPipelineAdd(null, 'por_tratar')).toBe(true);
  });

  it('returns true when null → any status', () => {
    expect(isPipelineAdd(null, 'em_contacto')).toBe(true);
    expect(isPipelineAdd(null, 'vir_treinar')).toBe(true);
  });

  it('returns false when old value exists', () => {
    expect(isPipelineAdd('em_contacto', 'por_tratar')).toBe(false);
  });

  it('returns false when both null', () => {
    expect(isPipelineAdd(null, null)).toBe(false);
  });
});

/* ───────────── isPipelineRemove ───────────── */

describe('isPipelineRemove', () => {
  it('returns true when recruitment_status has old value and null new value', () => {
    expect(isPipelineRemove('recruitment_status', 'em_contacto', null)).toBe(true);
    expect(isPipelineRemove('recruitment_status', 'por_tratar', null)).toBe(true);
  });

  it('returns false when field is not recruitment_status', () => {
    expect(isPipelineRemove('club', 'FC Porto', null)).toBe(false);
  });

  it('returns false when new value exists', () => {
    expect(isPipelineRemove('recruitment_status', 'por_tratar', 'em_contacto')).toBe(false);
  });

  it('returns false when old value is empty', () => {
    expect(isPipelineRemove('recruitment_status', null, null)).toBe(false);
  });
});

/* ───────────── buildSquadLabel ───────────── */

describe('buildSquadLabel', () => {
  it('extracts escalão from real squad notes', () => {
    expect(buildSquadLabel('is_real_squad', 'Adicionado ao plantel "Sub-14 Real" na posição DC'))
      .toBe('Plantel - Sub-14');
  });

  it('extracts escalão from shadow squad notes', () => {
    expect(buildSquadLabel('is_shadow_squad', 'Adicionado ao plantel "Sub-17 Sombra" na posição ED'))
      .toBe('Plantel Sombra - Sub-17');
  });

  it('falls back to type label when no notes', () => {
    expect(buildSquadLabel('is_real_squad', null)).toBe('Plantel');
    expect(buildSquadLabel('is_shadow_squad', null)).toBe('Plantel Sombra');
  });

  it('falls back to type label when notes have no quoted squad name', () => {
    expect(buildSquadLabel('is_real_squad', 'Adicionado ao plantel')).toBe('Plantel');
  });

  it('falls back to type label when squad name has no escalão', () => {
    expect(buildSquadLabel('is_real_squad', 'Adicionado ao plantel "Equipa A" na posição GR'))
      .toBe('Plantel');
  });

  it('extracts escalão from removal notes', () => {
    expect(buildSquadLabel('is_shadow_squad', 'Removido do plantel "Sub-15 Sombra" (era DC)'))
      .toBe('Plantel Sombra - Sub-15');
  });
});
