// src/lib/utils/author-name.ts
// Normaliza nomes de autor/coach para dedup e display consistente
// Remove prefixos honoríficos ("Mister", "Mr.", "Sr.", "Prof.", "Treinador"), acentos, collapsa espaços
// RELEVANT FILES: src/app/definicoes/feedback-treinos/FeedbackTreinosClient.tsx, src/app/api/feedback/[token]/route.ts

// Prefixos comuns em PT-PT para coaches. Um só match por iteração — o loop stripa stacked.
const PREFIX_REGEX = /^(mister|mr\.?|sr\.?|prof(?:essor)?\.?|treinador)\s+/i;

// Combining diacritical marks (U+0300–U+036F). Usado após NFD para remover acentos.
const DIACRITICS_REGEX = /[̀-ͯ]/g;

/** Strip common honorific prefixes and trim/collapse whitespace.
 *  Ex: "  Mister  João  Sousa " → "João Sousa"; "Mister Mr. X" → "X" */
export function stripCoachPrefix(name: string): string {
  let cleaned = name.trim().replace(/\s+/g, ' ');
  while (PREFIX_REGEX.test(cleaned)) {
    cleaned = cleaned.replace(PREFIX_REGEX, '');
  }
  return cleaned.trim();
}

/** Canonical key para dedup de nomes (dropdown filter).
 *  Lowercase + remove acentos + strip prefixos. Vazio se input vazio após strip. */
export function canonicalAuthorKey(name: string): string {
  return stripCoachPrefix(name)
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase();
}
