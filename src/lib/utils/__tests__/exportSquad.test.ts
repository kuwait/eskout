// src/lib/utils/__tests__/exportSquad.test.ts
// Tests for squad export text generators — pure functions, no browser APIs needed
// Validates plain text and WhatsApp format output
// RELEVANT FILES: src/lib/utils/exportSquad.ts, src/lib/constants.ts

import { exportAsText, exportAsWhatsApp, type ExportSquadData } from '@/lib/utils/exportSquad';
import { makePlayer } from '@/lib/__tests__/factories';

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

  it('includes player details (club, foot, opinion)', () => {
    const text = exportAsText(makeSquadData());
    expect(text).toContain('FC Porto');
    expect(text).toContain('1ª Escolha');
  });

  it('handles empty squad', () => {
    const text = exportAsText(makeSquadData({ byPosition: {} }));
    expect(text).toContain('PLANTEL SOMBRA');
    // Should not throw, just have title + date
    expect(text.split('\n').length).toBeGreaterThanOrEqual(2);
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
