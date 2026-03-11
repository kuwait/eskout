// src/lib/__tests__/constants.test.ts
// Tests for business rule constants and computed functions
// Validates age group computation, observation tiers, hybrid ratings, position labels
// RELEVANT FILES: src/lib/constants.ts, src/lib/types/index.ts, src/lib/__tests__/factories.ts

import {
  birthYearToAgeGroup,
  getAgeGroups,
  getObservationTier,
  getPrimaryRating,
  getPositionLabel,
  getNationalityFlag,
  CURRENT_SEASON,
  POSITION_CODES,
  SQUAD_SLOT_CODES,
  RECRUITMENT_STATUSES,
  TRAINING_PRESENCE,
} from '@/lib/constants';
import { makePlayer } from '@/lib/__tests__/factories';

/* ───────────── birthYearToAgeGroup ───────────── */

describe('birthYearToAgeGroup', () => {
  // These tests use the dynamic season logic.
  // Season end year = current year if month < July, else current year + 1.

  function getSeasonEndYear(): number {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  }

  it('maps a typical birth year to correct Sub-N', () => {
    const endYear = getSeasonEndYear();
    // Sub-14 = born in endYear - 14
    expect(birthYearToAgeGroup(endYear - 14)).toBe('Sub-14');
  });

  it('maps Sub-7 boundary correctly', () => {
    const endYear = getSeasonEndYear();
    expect(birthYearToAgeGroup(endYear - 7)).toBe('Sub-7');
  });

  it('maps Sub-19 boundary correctly', () => {
    const endYear = getSeasonEndYear();
    expect(birthYearToAgeGroup(endYear - 19)).toBe('Sub-19');
  });

  it('maps old birth year to Sénior', () => {
    const endYear = getSeasonEndYear();
    expect(birthYearToAgeGroup(endYear - 20)).toBe('Sénior');
    expect(birthYearToAgeGroup(endYear - 25)).toBe('Sénior');
    expect(birthYearToAgeGroup(1990)).toBe('Sénior');
  });

  it('returns null for future birth year (too young, below Sub-7)', () => {
    const endYear = getSeasonEndYear();
    // Born in endYear - 6 → age = 6, below Sub-7
    expect(birthYearToAgeGroup(endYear - 6)).toBeNull();
    // Born in endYear → age = 0
    expect(birthYearToAgeGroup(endYear)).toBeNull();
  });

  it('covers all age groups from Sub-7 to Sub-19', () => {
    const endYear = getSeasonEndYear();
    for (let age = 7; age <= 19; age++) {
      expect(birthYearToAgeGroup(endYear - age)).toBe(`Sub-${age}`);
    }
  });
});

/* ───────────── getAgeGroups ───────────── */

describe('getAgeGroups', () => {
  it('returns 14 groups (Sénior + Sub-7 through Sub-19)', () => {
    const groups = getAgeGroups();
    expect(groups).toHaveLength(14);
  });

  it('starts with Sénior', () => {
    const groups = getAgeGroups();
    expect(groups[0].name).toBe('Sénior');
  });

  it('ends with Sub-7', () => {
    const groups = getAgeGroups();
    expect(groups[groups.length - 1].name).toBe('Sub-7');
  });

  it('has unique generation years', () => {
    const groups = getAgeGroups();
    const years = groups.map((g) => g.generationYear);
    expect(new Set(years).size).toBe(years.length);
  });
});

/* ───────────── getObservationTier ───────────── */

describe('getObservationTier', () => {
  it('returns "observado" when player has non-empty report links', () => {
    const player = makePlayer({ reportLinks: ['https://example.com/report.pdf'] });
    expect(getObservationTier(player)).toBe('observado');
  });

  it('returns "referenciado" when player has referredBy but no reports', () => {
    const player = makePlayer({ reportLinks: [], referredBy: 'Carlos Lopes' });
    expect(getObservationTier(player)).toBe('referenciado');
  });

  it('returns "adicionado" when player has neither reports nor referral', () => {
    const player = makePlayer({ reportLinks: [], referredBy: '' });
    expect(getObservationTier(player)).toBe('adicionado');
  });

  it('treats empty-string report links as no reports', () => {
    const player = makePlayer({ reportLinks: ['', ''], referredBy: '' });
    expect(getObservationTier(player)).toBe('adicionado');
  });

  it('reports take priority over referredBy', () => {
    const player = makePlayer({
      reportLinks: ['https://example.com/r.pdf'],
      referredBy: 'Someone',
    });
    expect(getObservationTier(player)).toBe('observado');
  });
});

/* ───────────── getPrimaryRating ───────────── */

describe('getPrimaryRating', () => {
  it('prefers reportAvgRating over observerEval', () => {
    const player = makePlayer({ reportAvgRating: 4.5, observerEval: '3 - Bom' });
    const rating = getPrimaryRating(player);
    expect(rating).toEqual({ value: 4.5, isAverage: true });
  });

  it('falls back to observerEval when no report average', () => {
    const player = makePlayer({ reportAvgRating: null, observerEval: '4 - Muito Bom' });
    const rating = getPrimaryRating(player);
    expect(rating).toEqual({ value: 4, isAverage: false });
  });

  it('returns null when neither is available', () => {
    const player = makePlayer({ reportAvgRating: null, observerEval: '' });
    expect(getPrimaryRating(player)).toBeNull();
  });

  it('parses leading digit from observerEval format', () => {
    const player = makePlayer({ reportAvgRating: null, observerEval: '5 - Excelente' });
    const rating = getPrimaryRating(player);
    expect(rating).toEqual({ value: 5, isAverage: false });
  });
});

/* ───────────── getPositionLabel ───────────── */

describe('getPositionLabel', () => {
  it('returns Portuguese label for position codes', () => {
    expect(getPositionLabel('DC')).toBe('Defesa Central');
    expect(getPositionLabel('GR')).toBe('Guarda-Redes');
    expect(getPositionLabel('PL')).toBe('Ponta de Lança');
    expect(getPositionLabel('MOC')).toBe('Médio Ofensivo');
  });

  it('returns label for squad slots (DC_E, DC_D)', () => {
    expect(getPositionLabel('DC_E')).toBe('Central (E)');
    expect(getPositionLabel('DC_D')).toBe('Central (D)');
  });

  it('returns empty string for null/undefined', () => {
    expect(getPositionLabel(null)).toBe('');
    expect(getPositionLabel(undefined)).toBe('');
  });

  it('returns the code itself for unknown codes', () => {
    expect(getPositionLabel('XX')).toBe('XX');
  });
});

/* ───────────── getNationalityFlag ───────────── */

describe('getNationalityFlag', () => {
  it('returns correct flag for known nationalities', () => {
    expect(getNationalityFlag('Portugal')).toBe('🇵🇹');
    expect(getNationalityFlag('Brasil')).toBe('🇧🇷');
  });

  it('returns globe for unknown nationality', () => {
    expect(getNationalityFlag('Marte')).toBe('🌍');
  });

  it('returns empty string for null', () => {
    expect(getNationalityFlag(null)).toBe('');
  });

  it('is case-insensitive', () => {
    expect(getNationalityFlag('portugal')).toBe('🇵🇹');
    expect(getNationalityFlag('BRASIL')).toBe('🇧🇷');
  });
});

/* ───────────── CURRENT_SEASON ───────────── */

describe('CURRENT_SEASON', () => {
  it('matches YYYY/YYYY+1 format', () => {
    expect(CURRENT_SEASON).toMatch(/^\d{4}\/\d{4}$/);
    const [start, end] = CURRENT_SEASON.split('/').map(Number);
    expect(end - start).toBe(1);
  });
});

/* ───────────── Constants sanity checks ───────────── */

describe('constant arrays', () => {
  it('POSITION_CODES has 15 entries', () => {
    expect(POSITION_CODES).toHaveLength(15);
  });

  it('SQUAD_SLOT_CODES has 12 entries (10 positions + DC_E + DC_D, minus AD/AE/MD/ME/SA)', () => {
    expect(SQUAD_SLOT_CODES).toHaveLength(12);
    expect(SQUAD_SLOT_CODES).toContain('DC_E');
    expect(SQUAD_SLOT_CODES).toContain('DC_D');
    expect(SQUAD_SLOT_CODES).not.toContain('AD');
    expect(SQUAD_SLOT_CODES).not.toContain('AE');
    expect(SQUAD_SLOT_CODES).not.toContain('MD');
    expect(SQUAD_SLOT_CODES).not.toContain('ME');
    expect(SQUAD_SLOT_CODES).not.toContain('SA');
  });

  it('RECRUITMENT_STATUSES has 9 entries with tailwindLight properties', () => {
    expect(RECRUITMENT_STATUSES).toHaveLength(9);
    for (const status of RECRUITMENT_STATUSES) {
      expect(status.tailwindLight).toBeDefined();
      expect(status.tailwindLight.bg).toMatch(/^bg-/);
      expect(status.tailwindLight.text).toMatch(/^text-/);
      expect(status.tailwindLight.border).toMatch(/^border-/);
      expect(status.tailwindLight.dot).toMatch(/^bg-/);
    }
  });

  it('TRAINING_PRESENCE has 3 values', () => {
    expect(TRAINING_PRESENCE).toHaveLength(3);
    const values = TRAINING_PRESENCE.map((p) => p.value);
    expect(values).toContain('attended');
    expect(values).toContain('missed');
    expect(values).toContain('rescheduled');
  });

  it('TRAINING_PRESENCE entries have required fields', () => {
    for (const p of TRAINING_PRESENCE) {
      expect(p.labelPt).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(p.color).toBeTruthy();
    }
  });
});
