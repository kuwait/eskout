// src/lib/utils/__tests__/exportSquad.test.ts
// Tests for squad export text generators — pure functions, no browser APIs needed
// Validates plain text and WhatsApp format output
// RELEVANT FILES: src/lib/utils/exportSquad.ts, src/lib/constants.ts

import { buildDirectorExcelPayload, exportAsText, exportAsWhatsApp, type ExportSquadData } from '@/lib/utils/exportSquad';
import { makePlayer } from '@/lib/__tests__/factories';

/** Convert a positional row + headers into a header-keyed object for readable assertions */
function rowAsObject(p: ReturnType<typeof buildDirectorExcelPayload>, idx: number): Record<string, unknown> {
  return Object.fromEntries(p.headers.map((h, i) => [h, p.rows[idx][i]]));
}

/* ───────────── Test data ───────────── */

function makeSquadData(overrides?: Partial<ExportSquadData>): ExportSquadData {
  return {
    squadType: 'shadow',
    ageGroupLabel: 'Sub-14',
    byPosition: {
      GR: [makePlayer({ name: 'Miguel Ferreira', club: 'Leixões SC', foot: 'Dir' })],
      DC_E: [makePlayer({ name: 'Pedro Santos Costa', club: 'Boavista FC', foot: 'Esq' })],
      PL: [
        makePlayer({ name: 'André Oliveira', club: 'FC Porto', foot: 'Dir', departmentOpinion: ['1ª Escolha'] }),
        makePlayer({ name: 'Tomás Ribeiro', club: 'SC Braga', foot: 'Amb' }),
      ],
    },
    ...overrides,
  };
}

/* ───────────── exportAsText ───────────── */

describe('exportAsText', () => {
  it('includes squad type and age group in title', () => {
    const text = exportAsText(makeSquadData());
    expect(text).toContain('PLANTEL SOMBRA');
    expect(text).toContain('Sub-14');
  });

  it('includes today date in pt-PT format', () => {
    const text = exportAsText(makeSquadData());
    // Should contain dd/mm/yyyy format
    expect(text).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('lists position headers with slot code and label', () => {
    const text = exportAsText(makeSquadData());
    expect(text).toContain('GR — Guarda-Redes');
    expect(text).toContain('DC_E — Central (E)');
    expect(text).toContain('PL — Ponta de Lança');
  });

  it('shortens long names (first + last)', () => {
    const text = exportAsText(makeSquadData());
    // "Pedro Santos Costa" → "Pedro Costa"
    expect(text).toContain('Pedro Costa');
  });

  it('shows numbered ranking for shadow squad', () => {
    const text = exportAsText(makeSquadData({ squadType: 'shadow' }));
    expect(text).toContain('1. André Oliveira');
    expect(text).toContain('2. Tomás Ribeiro');
  });

  it('shows bullet points for real squad', () => {
    const text = exportAsText(makeSquadData({ squadType: 'real' }));
    expect(text).toContain('• Miguel Ferreira');
    expect(text).not.toContain('1. Miguel Ferreira');
  });

  it('includes player details (club, foot, dob) but not opinion', () => {
    const text = exportAsText(makeSquadData());
    expect(text).toContain('FC Porto');
    // Opinion was intentionally removed from text/whatsapp/table exports
    expect(text).not.toContain('1ª Escolha');
  });

  it('handles empty squad', () => {
    const text = exportAsText(makeSquadData({ byPosition: {} }));
    expect(text).toContain('PLANTEL SOMBRA');
    // Should not throw, just have title + date
    expect(text.split('\n').length).toBeGreaterThanOrEqual(2);
  });

  it('collapses redundant title when squad name equals age group', () => {
    // squad named "Sub-15" inside age group "Sub-15" → "PLANTEL SUB-15", not "SUB-15 — SUB-15"
    const text = exportAsText(makeSquadData({ squadType: 'real', squadName: 'Sub-15', ageGroupLabel: 'Sub-15' }));
    expect(text).toContain('PLANTEL SUB-15');
    expect(text).not.toContain('Sub-15 — Sub-15');
  });

  it('keeps both labels when squad name differs from age group', () => {
    // Age group case is preserved (only the left side is uppercased)
    const text = exportAsText(makeSquadData({ squadType: 'real', squadName: 'A', ageGroupLabel: 'Sub-15' }));
    expect(text).toContain('A — Sub-15');
  });
});

/* ───────────── exportAsWhatsApp ───────────── */

/* ───────────── buildDirectorExcelPayload ───────────── */

describe('buildDirectorExcelPayload', () => {
  it('uses the canonical 6-column header order', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real', squadName: 'Sub-15', ageGroupLabel: 'Sub-15' }));
    expect(p.headers).toEqual(['Nome', 'Data Nascimento', 'Posição', 'Clube Anterior', 'Contacto', 'Observações']);
  });

  it('emits one row per player and orders by pitch slot (GR before PL)', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }));
    expect(p.rows).toHaveLength(4); // GR + DC_E + 2x PL
    expect(rowAsObject(p, 0).Nome).toBe('Miguel Ferreira'); // GR
    expect(rowAsObject(p, p.rows.length - 1).Nome).toBe('Tomás Ribeiro'); // last PL
  });

  it('uses Portuguese slot labels (not codes) for Posição', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }));
    const positions = p.rows.map((_, i) => rowAsObject(p, i).Posição);
    expect(positions).toContain('Guarda-Redes');
    expect(positions).toContain('Central (E)');
    expect(positions).toContain('Ponta de Lança');
    expect(positions).not.toContain('GR');
    expect(positions).not.toContain('DC_E');
  });

  it('preserves full names (no shortening) — directors need the full name', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }));
    const names = p.rows.map((_, i) => rowAsObject(p, i).Nome);
    expect(names).toContain('Pedro Santos Costa');
  });

  it('parses dob into a Date object so Excel renders it as a date type', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }));
    const goalkeeperIdx = p.rows.findIndex((_, i) => rowAsObject(p, i).Posição === 'Guarda-Redes');
    expect(rowAsObject(p, goalkeeperIdx)['Data Nascimento']).toBeInstanceOf(Date);
  });

  it('keeps Observações empty so directors can fill it in', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }));
    expect(p.rows.every((_, i) => rowAsObject(p, i).Observações === '')).toBe(true);
  });

  it('uses the season starting in July (Apr 16 2026 → 2025/2026)', () => {
    const p = buildDirectorExcelPayload(makeSquadData(), undefined, new Date('2026-04-16'));
    expect(p.subtitle).toBe('Época Desportiva 2025/2026');
  });

  it('uses the new season after July 1 (Aug 1 2026 → 2026/2027)', () => {
    const p = buildDirectorExcelPayload(makeSquadData(), undefined, new Date('2026-08-01'));
    expect(p.subtitle).toBe('Época Desportiva 2026/2027');
  });

  it('uses the collapsed title when squad name matches age group', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real', squadName: 'Sub-15', ageGroupLabel: 'Sub-15' }));
    expect(p.title).toBe('Plantel Sub-15');
  });

  it('falls back to "Plantel — <age>" when no custom squad name is provided', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real', squadName: undefined, ageGroupLabel: 'Sub-14' }));
    expect(p.title).toBe('Plantel — Sub-14');
  });

  it('handles empty squad — keeps headers, returns zero rows', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ byPosition: {} }));
    expect(p.headers).toHaveLength(6);
    expect(p.rows).toHaveLength(0);
  });

  it('handles player with null dob — emits null (not NaN Date)', () => {
    const p = buildDirectorExcelPayload(
      makeSquadData({ byPosition: { GR: [makePlayer({ name: 'X', dob: null })] } })
    );
    expect(rowAsObject(p, 0)['Data Nascimento']).toBeNull();
  });

  it('handles player with malformed dob — emits null instead of crashing', () => {
    const p = buildDirectorExcelPayload(
      makeSquadData({ byPosition: { GR: [makePlayer({ name: 'X', dob: 'not-a-date' })] } })
    );
    expect(rowAsObject(p, 0)['Data Nascimento']).toBeNull();
  });

  it('emits empty string for missing contact (no "—" or "N/A" placeholder)', () => {
    const p = buildDirectorExcelPayload(
      makeSquadData({ byPosition: { GR: [makePlayer({ name: 'X', contact: '' })] } })
    );
    expect(rowAsObject(p, 0).Contacto).toBe('');
  });

  it('preserves the Portuguese "Posição" header (not English)', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }));
    expect(p.headers).toContain('Posição');
    expect(p.headers).not.toContain('Position');
  });

  it('orders rows: GR → defenders → midfielders → strikers (pitch order)', () => {
    const p = buildDirectorExcelPayload(makeSquadData({
      squadType: 'real',
      byPosition: {
        PL: [makePlayer({ name: 'Striker' })],
        GR: [makePlayer({ name: 'Keeper' })],
        MC: [makePlayer({ name: 'Midfielder' })],
      },
    }));
    const names = p.rows.map((_, i) => rowAsObject(p, i).Nome);
    expect(names).toEqual(['Keeper', 'Midfielder', 'Striker']);
  });

  /* ───────────── Custom column selection / ordering ───────────── */

  it('honours custom column order — Posição before Nome when selected that way', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }), ['position', 'name']);
    expect(p.headers).toEqual(['Posição', 'Nome']);
    expect(p.rows[0]).toHaveLength(2);
  });

  it('only emits selected columns', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }), ['name', 'foot']);
    expect(p.headers).toEqual(['Nome', 'Pé']);
    expect(p.rows.every((r) => r.length === 2)).toBe(true);
  });

  it('exposes the extra "Pé" column when selected', () => {
    const p = buildDirectorExcelPayload(
      makeSquadData({ byPosition: { GR: [makePlayer({ name: 'X', foot: 'Esq' })] } }),
      ['name', 'foot'],
    );
    expect(rowAsObject(p, 0).Pé).toBe('Esq');
  });

  it('drops unknown column IDs silently (forward-compatible with stale localStorage)', () => {
    const p = buildDirectorExcelPayload(
      makeSquadData({ squadType: 'real' }),
      // @ts-expect-error — intentionally passing an invalid id to test resilience
      ['name', 'unknownColumn', 'dob'],
    );
    expect(p.headers).toEqual(['Nome', 'Data Nascimento']);
  });

  it('falls back to defaults when given an empty selection', () => {
    const p = buildDirectorExcelPayload(makeSquadData({ squadType: 'real' }), []);
    expect(p.headers).toEqual(['Nome', 'Data Nascimento', 'Posição', 'Clube Anterior', 'Contacto', 'Observações']);
  });

  it('falls back to defaults when every selected ID is unknown', () => {
    const p = buildDirectorExcelPayload(
      makeSquadData({ squadType: 'real' }),
      // @ts-expect-error — intentionally invalid
      ['totallyMadeUp', 'nope'],
    );
    expect(p.headers).toEqual(['Nome', 'Data Nascimento', 'Posição', 'Clube Anterior', 'Contacto', 'Observações']);
  });

  /* ───────────── Extra columns ───────────── */

  it('exposes the 4 extras: posição secundária, peso, nacionalidade, país nascimento', () => {
    const p = buildDirectorExcelPayload(
      makeSquadData({ byPosition: { GR: [makePlayer({
        name: 'X',
        secondaryPosition: 'DC',
        weight: 75,
        nationality: 'Português',
        birthCountry: 'Portugal',
      })] } }),
      ['name', 'secondaryPosition', 'weight', 'nationality', 'birthCountry'],
    );
    expect(p.headers).toEqual(['Nome', 'Posição Secundária', 'Peso', 'Nacionalidade', 'País Nascimento']);
    expect(rowAsObject(p, 0)['Posição Secundária']).toBe('DC');
    expect(rowAsObject(p, 0).Peso).toBe(75);
    expect(rowAsObject(p, 0).Nacionalidade).toBe('Português');
    expect(rowAsObject(p, 0)['País Nascimento']).toBe('Portugal');
  });
});

/* ───────────── exportAsWhatsApp ───────────── */

describe('exportAsWhatsApp', () => {
  it('includes WhatsApp bold markers', () => {
    const text = exportAsWhatsApp(makeSquadData());
    expect(text).toContain('*Plantel Sombra — Sub-14*');
  });

  it('includes position emojis', () => {
    const text = exportAsWhatsApp(makeSquadData());
    expect(text).toContain('🧤'); // GR
    expect(text).toContain('🛡️'); // DC
    expect(text).toContain('⚽'); // PL
  });

  it('includes calendar emoji with date', () => {
    const text = exportAsWhatsApp(makeSquadData());
    expect(text).toContain('📅');
  });

  it('includes player names and clubs', () => {
    const text = exportAsWhatsApp(makeSquadData());
    expect(text).toContain('Miguel Ferreira');
    expect(text).toContain('Leixões SC');
  });
});
