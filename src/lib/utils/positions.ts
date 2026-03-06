// src/lib/utils/positions.ts
// Position normalization: maps free-text position strings from Excel to standard position codes
// Handles all known variations from the scouting database (SOP Section 11)
// RELEVANT FILES: src/lib/constants.ts, src/lib/types/index.ts, src/actions/players.ts

import type { PositionCode } from '@/lib/types';

/**
 * Mapping of lowercase input variations → normalized position code.
 * Compound positions (e.g. "DC/MDC") map to the first/primary position.
 * "Extremo" or "Ala" without side → returns '' (admin assigns manually).
 */
const POSITION_MAP: Record<string, PositionCode> = {
  // GR
  'guarda redes': 'GR',
  'guarda-redes': 'GR',
  'gr': 'GR',
  'goalkeeper': 'GR',

  // DD
  'lateral direito': 'DD',
  'defesa direito': 'DD',
  'dd': 'DD',

  // DE
  'lateral esquerdo': 'DE',
  'defesa esquerdo': 'DE',
  'de': 'DE',
  'dae': 'DE',
  'de/dd': 'DE',

  // DC
  'defesa central': 'DC',
  'defesa-central': 'DC',
  'dc': 'DC',
  'dc/mdc': 'DC',
  'dc/de': 'DC',
  'defesa': 'DC',
  'def': 'DC',

  // MDC
  'pivô': 'MDC',
  'pivo': 'MDC',
  'médio defensivo': 'MDC',
  'medio defensivo': 'MDC',
  'mdc': 'MDC',
  'medio def': 'MDC',
  'médio defensivo centro': 'MDC',
  'medio defensivo centro': 'MDC',

  // MC
  'médio centro': 'MC',
  'medio centro': 'MC',
  'mc': 'MC',
  'médio': 'MC',
  'medio': 'MC',

  // MOC
  'médio ofensivo': 'MOC',
  'medio ofensivo': 'MOC',
  'mco': 'MOC',
  'moc': 'MOC',
  'mod': 'MOC',
  'médio ofensivo centro': 'MOC',
  'medio ofensivo centro': 'MOC',
  'mc / mco': 'MOC',
  'mc/mco': 'MOC',

  // ED
  'extremo direito': 'ED',
  'ed': 'ED',
  'ed/pl': 'ED',
  'ed/de': 'ED',

  // EE
  'extremo esquerdo': 'EE',
  'ee': 'EE',
  'ee/pl': 'EE',

  // MD
  'médio direito': 'MD',
  'medio direito': 'MD',
  'md': 'MD',

  // ME
  'médio esquerdo': 'ME',
  'medio esquerdo': 'ME',
  'me': 'ME',

  // AD
  'ala direito': 'AD',
  'ad': 'AD',

  // AE
  'ala esquerdo': 'AE',
  'ae': 'AE',

  // SA
  'segundo avançado': 'SA',
  'segundo avancado': 'SA',
  'sa': 'SA',
  '2º avançado': 'SA',
  '2o avançado': 'SA',
  '2o avancado': 'SA',

  // PL
  'ponta de lança': 'PL',
  'ponta de lanca': 'PL',
  'pl': 'PL',
  'avançado': 'PL',
  'avancado': 'PL',
  'avançado centro': 'PL',
  'avancado centro': 'PL',
  'avançado/extremo': 'PL',
  'avancado/extremo': 'PL',

  // Compound — "Defesa Esquerdo/Extremo Esquerdo" → primary = DE
  'defesa esquerdo/extremo esquerdo': 'DE',
};

/**
 * Normalize a free-text position string into a PositionCode.
 * Returns '' if the input is ambiguous (e.g. "Extremo" without side) or unknown.
 */
export function normalizePosition(raw: string | null | undefined): PositionCode | '' {
  if (!raw) return '';

  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return '';

  // Direct lookup
  const direct = POSITION_MAP[cleaned];
  if (direct) return direct;

  // Try removing extra whitespace
  const collapsed = cleaned.replace(/\s+/g, ' ');
  const collapsed2 = POSITION_MAP[collapsed];
  if (collapsed2) return collapsed2;

  // Ambiguous cases — "Extremo" or "Ala" without side
  if (cleaned === 'extremo' || cleaned === 'ext') {
    return '';
  }
  if (cleaned === 'ala') {
    return '';
  }

  return '';
}
