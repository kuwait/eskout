// src/lib/constants/quick-report-tags.ts
// Position-specific tags for Quick Scout Reports — mobile tap chips
// Separated from main constants.ts to keep it focused
// RELEVANT FILES: src/components/players/QuickReportForm.tsx, src/lib/types/index.ts

/* ───────────── Dimension Labels ───────────── */

export const DIMENSIONS = [
  { key: 'tecnica', label: 'Técnica', emoji: '⚽' },
  { key: 'tatica', label: 'Tática', emoji: '🧠' },
  { key: 'fisico', label: 'Físico', emoji: '💪' },
  { key: 'mentalidade', label: 'Mentalidade', emoji: '🔥' },
  { key: 'potencial', label: 'Potencial', emoji: '📈' },
] as const;

export type DimensionKey = typeof DIMENSIONS[number]['key'];

/* ───────────── Tag Sets — Outfield Players ───────────── */

const TAGS_TECNICA_OUTFIELD = [
  'Bom primeiro toque',
  'Drible eficaz',
  'Passe longo',
  'Passe curto',
  'Finalização',
  'Cruzamento',
  'Cabeceamento',
  'Controlo de bola',
  'Técnica refinada',
  'Perde muitas bolas',
  'Técnica limitada',
];

const TAGS_TATICA_OUTFIELD = [
  'Bom posicionamento',
  'Leitura de jogo',
  'Transição rápida',
  'Pressão alta',
  'Cobertura defensiva',
  'Criação de espaço',
  'Jogo entre linhas',
  'Desiquilibra',
  'Movimentação inteligente',
  'Perde-se taticamente',
  'Mau posicionamento',
];

const TAGS_FISICO_OUTFIELD = [
  'Rápido',
  'Forte no duelo',
  'Resistente',
  'Boa aceleração',
  'Explosivo',
  'Bom jogo aéreo',
  'Ágil',
  'Alto',
  'Lento',
  'Fraco fisicamente',
  'Cansa rápido',
];

const TAGS_MENTALIDADE_OUTFIELD = [
  'Líder',
  'Competitivo',
  'Concentrado',
  'Comunicativo',
  'Corajoso',
  'Inteligente',
  'Calmo sob pressão',
  'Trabalha para a equipa',
  'Desiste fácil',
  'Nervoso',
  'Individualista',
];

const TAGS_POTENCIAL_OUTFIELD = [
  'Pronto para saltar',
  'Alto potencial',
  'Margem de evolução',
  'Precisa de tempo',
  'Jogador de projeto',
  'Pode jogar acima',
  'Destaca-se no escalão',
  'Potencial limitado',
];

/* ───────────── Tag Sets — Goalkeeper (GR) ───────────── */

const TAGS_TECNICA_GR = [
  'Boa colocação',
  'Bom jogo de pés',
  'Reflexos',
  'Saídas seguras',
  'Domínio da área',
  'Jogo aéreo forte',
  '1v1 forte',
  'Distribuição longa',
  'Distribuição curta',
  'Pés fracos',
  'Hesitante nas saídas',
];

const TAGS_TATICA_GR = [
  'Comanda a defesa',
  'Boa leitura',
  'Posicionamento correto',
  'Inicia jogo curto',
  'Inicia jogo longo',
  'Saídas da área',
  'Antecipa o perigo',
  'Mal posicionado',
  'Passivo',
];

const TAGS_FISICO_GR = [
  'Envergadura',
  'Reflexos rápidos',
  'Explosivo',
  'Ágil lateralmente',
  'Forte no mergulho',
  'Alto',
  'Boa flexibilidade',
  'Lento a reagir',
  'Falta de envergadura',
];

const TAGS_MENTALIDADE_GR = [
  'Transmite segurança',
  'Líder vocal',
  'Concentrado',
  'Calmo',
  'Corajoso nas saídas',
  'Recupera bem de erros',
  'Comunica com a defesa',
  'Nervoso',
  'Abalado por erros',
];

const TAGS_POTENCIAL_GR = [
  'Pronto para saltar',
  'Alto potencial',
  'Margem de evolução',
  'Precisa de tempo',
  'Jogador de projeto',
  'Pode jogar acima',
  'Destaca-se no escalão',
  'Potencial limitado',
];

/* ───────────── Exported Tag Getter ───────────── */

/** Get tags for a dimension, position-aware (GR gets specialized tags) */
export function getTagsForDimension(dimension: DimensionKey, isGoalkeeper: boolean): string[] {
  if (isGoalkeeper) {
    switch (dimension) {
      case 'tecnica': return TAGS_TECNICA_GR;
      case 'tatica': return TAGS_TATICA_GR;
      case 'fisico': return TAGS_FISICO_GR;
      case 'mentalidade': return TAGS_MENTALIDADE_GR;
      case 'potencial': return TAGS_POTENCIAL_GR;
    }
  }
  switch (dimension) {
    case 'tecnica': return TAGS_TECNICA_OUTFIELD;
    case 'tatica': return TAGS_TATICA_OUTFIELD;
    case 'fisico': return TAGS_FISICO_OUTFIELD;
    case 'mentalidade': return TAGS_MENTALIDADE_OUTFIELD;
    case 'potencial': return TAGS_POTENCIAL_OUTFIELD;
  }
}

/* ───────────── Recommendation Options ───────────── */

export const RECOMMENDATIONS = [
  { value: 'Assinar' as const, label: 'Assinar', color: 'bg-green-500 text-white' },
  { value: 'Acompanhar' as const, label: 'Acompanhar', color: 'bg-yellow-500 text-white' },
  { value: 'Sem interesse' as const, label: 'Sem interesse', color: 'bg-red-500 text-white' },
];
