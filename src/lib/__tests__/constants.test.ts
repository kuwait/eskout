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
  getEscalaoBirthYearRange,
  isSpecialSection,
  CURRENT_SEASON,
  POSITION_CODES,
  SQUAD_SLOT_CODES,
  SPECIAL_SQUAD_SECTIONS,
  SPECIAL_SECTION_LABELS,
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

  it('maps Sub-3 boundary correctly', () => {
    const endYear = getSeasonEndYear();
    expect(birthYearToAgeGroup(endYear - 3)).toBe('Sub-3');
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

  it('returns null for future birth year (too young, below Sub-3)', () => {
    const endYear = getSeasonEndYear();
    // Born in endYear - 2 → age = 2, below Sub-3
    expect(birthYearToAgeGroup(endYear - 2)).toBeNull();
    // Born in endYear → age = 0
    expect(birthYearToAgeGroup(endYear)).toBeNull();
  });

  it('covers all age groups from Sub-3 to Sub-19', () => {
    const endYear = getSeasonEndYear();
    for (let age = 3; age <= 19; age++) {
      expect(birthYearToAgeGroup(endYear - age)).toBe(`Sub-${age}`);
    }
  });
});

/* ───────────── getAgeGroups ───────────── */

describe('getAgeGroups', () => {
  it('returns 18 groups (Sénior + Sub-3 through Sub-19)', () => {
    const groups = getAgeGroups();
    expect(groups).toHaveLength(18);
  });

  it('starts with Sénior', () => {
    const groups = getAgeGroups();
    expect(groups[0].name).toBe('Sénior');
  });

  it('ends with Sub-3', () => {
    const groups = getAgeGroups();
    expect(groups[groups.length - 1].name).toBe('Sub-3');
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

  it('matches accent-less DB values via normalizeAccents', () => {
    expect(getNationalityFlag('Africa Do Sul')).toBe('🇿🇦');
    expect(getNationalityFlag('Ucrania')).toBe('🇺🇦');
    expect(getNationalityFlag('Colombia')).toBe('🇨🇴');
    expect(getNationalityFlag('Russia')).toBe('🇷🇺');
  });

  it('resolves aliases for alternative DB spellings', () => {
    expect(getNationalityFlag('Republica Checa')).toBe('🇨🇿');
    expect(getNationalityFlag('Inglaterra / Reino Unido')).toBe('🏴󠁧󠁢󠁥󠁮󠁧󠁿');
    expect(getNationalityFlag('Republica Pop.Da China')).toBe('🇨🇳');
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

  it('RECRUITMENT_STATUSES has 8 entries with tailwindLight properties', () => {
    expect(RECRUITMENT_STATUSES).toHaveLength(8);
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

/* ───────────── getEscalaoBirthYearRange ───────────── */

describe('getEscalaoBirthYearRange', () => {
  // Season 2025/2026: ref year = 2026
  const SEASON_START = 2025;

  it('Sub-15 2025/26 → born 2011 (normal), 2012+ plays up', () => {
    const range = getEscalaoBirthYearRange('Sub-15', SEASON_START);
    expect(range).toEqual({ start: 2011, end: 2011 });
  });

  it('Sub-13 2025/26 → born 2013', () => {
    const range = getEscalaoBirthYearRange('Sub-13', SEASON_START);
    expect(range).toEqual({ start: 2013, end: 2013 });
  });

  it('Sub-11 2025/26 → born 2015', () => {
    const range = getEscalaoBirthYearRange('Sub-11', SEASON_START);
    expect(range).toEqual({ start: 2015, end: 2015 });
  });

  it('Sub-17 2025/26 → born 2009', () => {
    const range = getEscalaoBirthYearRange('Sub-17', SEASON_START);
    expect(range).toEqual({ start: 2009, end: 2009 });
  });

  it('Sub-19 2025/26 → born 2004-2007', () => {
    const range = getEscalaoBirthYearRange('Sub-19', SEASON_START);
    expect(range).toEqual({ start: 2004, end: 2007 });
  });

  it('Sub-7 2025/26 → born 2019', () => {
    const range = getEscalaoBirthYearRange('Sub-7', SEASON_START);
    expect(range).toEqual({ start: 2019, end: 2019 });
  });

  it('returns null for unknown escalão', () => {
    expect(getEscalaoBirthYearRange('Sub-99', SEASON_START)).toBeNull();
  });

  it('works for different seasons (Sub-15 2024/25 → born 2010)', () => {
    const range = getEscalaoBirthYearRange('Sub-15', 2024);
    expect(range).toEqual({ start: 2010, end: 2010 });
  });

  it('playing up detection: 2012 born in Sub-15 2025/26 = +1 year above', () => {
    const range = getEscalaoBirthYearRange('Sub-15', SEASON_START)!;
    const birthYear = 2012;
    expect(birthYear).toBeGreaterThan(range.end); // playing up
    expect(birthYear - range.end).toBe(1); // +1 ano
  });

  it('playing up detection: 2011 born in Sub-15 2025/26 = normal (not playing up)', () => {
    const range = getEscalaoBirthYearRange('Sub-15', SEASON_START)!;
    const birthYear = 2011;
    expect(birthYear).toBeLessThanOrEqual(range.end); // not playing up
  });
});

/* ───────────── Special Squad Sections ───────────── */

describe('SPECIAL_SQUAD_SECTIONS', () => {
  it('has exactly 2 entries', () => {
    expect(SPECIAL_SQUAD_SECTIONS).toHaveLength(2);
  });

  it('contains DUVIDA and POSSIBILIDADE', () => {
    expect(SPECIAL_SQUAD_SECTIONS).toContain('DUVIDA');
    expect(SPECIAL_SQUAD_SECTIONS).toContain('POSSIBILIDADE');
  });

  it('does not overlap with SQUAD_SLOT_CODES', () => {
    for (const section of SPECIAL_SQUAD_SECTIONS) {
      expect(SQUAD_SLOT_CODES).not.toContain(section);
    }
  });
});

describe('SPECIAL_SECTION_LABELS', () => {
  it('maps DUVIDA to Portuguese label', () => {
    expect(SPECIAL_SECTION_LABELS.DUVIDA).toBe('Dúvida');
  });

  it('maps POSSIBILIDADE to Portuguese label', () => {
    expect(SPECIAL_SECTION_LABELS.POSSIBILIDADE).toBe('Possibilidades');
  });
});

describe('isSpecialSection', () => {
  it('returns true for DUVIDA', () => {
    expect(isSpecialSection('DUVIDA')).toBe(true);
  });

  it('returns true for POSSIBILIDADE', () => {
    expect(isSpecialSection('POSSIBILIDADE')).toBe(true);
  });

  it('returns false for regular position codes', () => {
    expect(isSpecialSection('GR')).toBe(false);
    expect(isSpecialSection('DC')).toBe(false);
    expect(isSpecialSection('MC')).toBe(false);
    expect(isSpecialSection('PL')).toBe(false);
  });

  it('returns false for DC sub-slots', () => {
    expect(isSpecialSection('DC_E')).toBe(false);
    expect(isSpecialSection('DC_D')).toBe(false);
  });

  it('returns false for empty string and invalid codes', () => {
    expect(isSpecialSection('')).toBe(false);
    expect(isSpecialSection('XX')).toBe(false);
    expect(isSpecialSection('duvida')).toBe(false);
  });
});
