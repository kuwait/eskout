// src/lib/constants/quick-report-tags.ts
// Position-specific tags for Quick Scout Reports — mobile tap chips
// Tags have sentiment (positive/negative) for visual distinction
// RELEVANT FILES: src/components/players/QuickReportForm.tsx, src/lib/types/index.ts

/* ───────────── Types ───────────── */

export interface Tag {
  label: string;
  sentiment: 'positive' | 'negative';
}

/* ───────────── Dimension Labels + Colors ───────────── */

export const DIMENSIONS = [
  { key: 'tecnica', label: 'Técnica', emoji: '⚽', color: 'bg-sky-500', borderColor: 'border-l-sky-500', textColor: 'text-sky-600' },
  { key: 'tatica', label: 'Tática', emoji: '🧠', color: 'bg-violet-500', borderColor: 'border-l-violet-500', textColor: 'text-violet-600' },
  { key: 'fisico', label: 'Físico', emoji: '💪', color: 'bg-orange-500', borderColor: 'border-l-orange-500', textColor: 'text-orange-600' },
  { key: 'mentalidade', label: 'Mentalidade', emoji: '🔥', color: 'bg-rose-500', borderColor: 'border-l-rose-500', textColor: 'text-rose-600' },
  { key: 'potencial', label: 'Potencial', emoji: '📈', color: 'bg-emerald-500', borderColor: 'border-l-emerald-500', textColor: 'text-emerald-600' },
] as const;

export type DimensionKey = typeof DIMENSIONS[number]['key'];

/* ───────────── Tag Sets — Outfield Players ───────────── */

/* Tags derived from frequency analysis of 1500+ real scouting reports (March 2026)
   Using exact expressions scouts write most often */

const TAGS_TECNICA_OUTFIELD: Tag[] = [
  // From strengths: passe (73), controlo de bola (51), drible (42), finalização (24), bom remate (16), primeiro toque (10), cruzamento (4)
  { label: 'Passe', sentiment: 'positive' },
  { label: 'Controlo de bola', sentiment: 'positive' },
  { label: 'Drible', sentiment: 'positive' },
  { label: 'Finalização', sentiment: 'positive' },
  { label: 'Bom remate', sentiment: 'positive' },
  { label: 'Primeiro toque', sentiment: 'positive' },
  { label: 'Cruzamento', sentiment: 'positive' },
  { label: 'Criativo', sentiment: 'positive' },
  { label: 'Receções orientadas', sentiment: 'positive' },
  { label: 'Joga com os dois pés', sentiment: 'positive' },
  { label: 'Segura bem a bola', sentiment: 'positive' },
  // From weaknesses: pé menos dominante (40), pé esquerdo (33), primeiro toque (11), finalização (10), drible (5)
  { label: 'Pé menos dominante', sentiment: 'negative' },
  { label: 'Primeiro toque fraco', sentiment: 'negative' },
  { label: 'Perde muitas bolas', sentiment: 'negative' },
];

const TAGS_TATICA_OUTFIELD: Tag[] = [
  // From strengths: visão de jogo (40), desarme (32), posicionamento (19), boas noções do jogo (12), forte 1x1 (8), antecipação (5), marcação (5)
  { label: 'Visão de jogo', sentiment: 'positive' },
  { label: 'Desarme', sentiment: 'positive' },
  { label: 'Bom posicionamento', sentiment: 'positive' },
  { label: 'Boas noções de jogo', sentiment: 'positive' },
  { label: 'Forte no 1x1', sentiment: 'positive' },
  { label: 'Antecipação', sentiment: 'positive' },
  { label: 'Marcação', sentiment: 'positive' },
  { label: 'Comprometido defensivamente', sentiment: 'positive' },
  { label: 'Pressiona alto', sentiment: 'positive' },
  { label: 'Desmarcações', sentiment: 'positive' },
  // From weaknesses: posicionamento (3), comportamento defensivo (4), tomada de decisão (3+4), intensidade (5)
  { label: 'Mau posicionamento', sentiment: 'negative' },
  { label: 'Tomada de decisão', sentiment: 'negative' },
  { label: 'Comportamento defensivo', sentiment: 'negative' },
];

const TAGS_FISICO_OUTFIELD: Tag[] = [
  // From strengths: rápido (33), velocidade (10), forte fisicamente (9), força (9), jogo aéreo (5), alto (4), ágil (3)
  { label: 'Rápido', sentiment: 'positive' },
  { label: 'Forte fisicamente', sentiment: 'positive' },
  { label: 'Ágil', sentiment: 'positive' },
  { label: 'Bom jogo aéreo', sentiment: 'positive' },
  { label: 'Alto', sentiment: 'positive' },
  { label: 'Explosivo', sentiment: 'positive' },
  { label: 'Atlético', sentiment: 'positive' },
  { label: 'Resistente', sentiment: 'positive' },
  // From weaknesses: velocidade (12), lento (12), altura (27), bolas aéreas (5), fisico (5), baixo (4), franzino (6), cardio (4)
  { label: 'Lento', sentiment: 'negative' },
  { label: 'Baixo', sentiment: 'negative' },
  { label: 'Franzino', sentiment: 'negative' },
  { label: 'Fraco fisicamente', sentiment: 'negative' },
  { label: 'Falta de resistência', sentiment: 'negative' },
];

const TAGS_MENTALIDADE_OUTFIELD: Tag[] = [
  // From strengths: combativo (43), liderança (12), comunicação (11), entrega (7), concentração (5)
  { label: 'Combativo', sentiment: 'positive' },
  { label: 'Liderança', sentiment: 'positive' },
  { label: 'Comunicação', sentiment: 'positive' },
  { label: 'Entrega', sentiment: 'positive' },
  { label: 'Concentração', sentiment: 'positive' },
  { label: 'Inteligente no jogo', sentiment: 'positive' },
  { label: 'Muito ativo no jogo', sentiment: 'positive' },
  { label: 'Procura o jogo', sentiment: 'positive' },
  // From weaknesses: individualista (4), faltoso (8+3), comunicação (7), intensidade (5)
  { label: 'Individualista', sentiment: 'negative' },
  { label: 'Faltoso', sentiment: 'negative' },
  { label: 'Falta de comunicação', sentiment: 'negative' },
  { label: 'Falta de intensidade', sentiment: 'negative' },
];

const TAGS_POTENCIAL_OUTFIELD: Tag[] = [
  // From strengths/analysis: tecnicamente evoluído (4), diferenciado (3), utiliza bem o pior pé (4)
  { label: 'Destaca-se no escalão', sentiment: 'positive' },
  { label: 'Pode jogar acima', sentiment: 'positive' },
  { label: 'Tecnicamente evoluído', sentiment: 'positive' },
  { label: 'Diferenciado', sentiment: 'positive' },
  { label: 'Alto potencial', sentiment: 'positive' },
  { label: 'Margem de evolução', sentiment: 'positive' },
  { label: 'Jogador de projeto', sentiment: 'positive' },
  { label: 'Pronto para saltar', sentiment: 'positive' },
  { label: 'Potencial limitado', sentiment: 'negative' },
  { label: 'Precisa de mais tempo', sentiment: 'negative' },
];

/* ───────────── Tag Sets — Goalkeeper (GR) ───────────── */

const TAGS_TECNICA_GR: Tag[] = [
  { label: 'Boa colocação', sentiment: 'positive' },
  { label: 'Bom jogo de pés', sentiment: 'positive' },
  { label: 'Reflexos', sentiment: 'positive' },
  { label: 'Saídas seguras', sentiment: 'positive' },
  { label: 'Domínio da área', sentiment: 'positive' },
  { label: 'Jogo aéreo forte', sentiment: 'positive' },
  { label: '1v1 forte', sentiment: 'positive' },
  { label: 'Distribuição longa', sentiment: 'positive' },
  { label: 'Distribuição curta', sentiment: 'positive' },
  { label: 'Pés fracos', sentiment: 'negative' },
  { label: 'Hesitante nas saídas', sentiment: 'negative' },
];

const TAGS_TATICA_GR: Tag[] = [
  { label: 'Comanda a defesa', sentiment: 'positive' },
  { label: 'Boa leitura', sentiment: 'positive' },
  { label: 'Posicionamento correto', sentiment: 'positive' },
  { label: 'Inicia jogo curto', sentiment: 'positive' },
  { label: 'Inicia jogo longo', sentiment: 'positive' },
  { label: 'Saídas da área', sentiment: 'positive' },
  { label: 'Antecipa o perigo', sentiment: 'positive' },
  { label: 'Mal posicionado', sentiment: 'negative' },
  { label: 'Passivo', sentiment: 'negative' },
];

const TAGS_FISICO_GR: Tag[] = [
  { label: 'Envergadura', sentiment: 'positive' },
  { label: 'Reflexos rápidos', sentiment: 'positive' },
  { label: 'Explosivo', sentiment: 'positive' },
  { label: 'Ágil lateralmente', sentiment: 'positive' },
  { label: 'Forte no mergulho', sentiment: 'positive' },
  { label: 'Alto', sentiment: 'positive' },
  { label: 'Boa flexibilidade', sentiment: 'positive' },
  { label: 'Lento a reagir', sentiment: 'negative' },
  { label: 'Falta de envergadura', sentiment: 'negative' },
];

const TAGS_MENTALIDADE_GR: Tag[] = [
  { label: 'Transmite segurança', sentiment: 'positive' },
  { label: 'Líder vocal', sentiment: 'positive' },
  { label: 'Concentrado', sentiment: 'positive' },
  { label: 'Calmo', sentiment: 'positive' },
  { label: 'Corajoso nas saídas', sentiment: 'positive' },
  { label: 'Recupera bem de erros', sentiment: 'positive' },
  { label: 'Comunica com a defesa', sentiment: 'positive' },
  { label: 'Nervoso', sentiment: 'negative' },
  { label: 'Abalado por erros', sentiment: 'negative' },
];

const TAGS_POTENCIAL_GR: Tag[] = [
  { label: 'Pronto para saltar', sentiment: 'positive' },
  { label: 'Alto potencial', sentiment: 'positive' },
  { label: 'Margem de evolução', sentiment: 'positive' },
  { label: 'Precisa de tempo', sentiment: 'positive' },
  { label: 'Jogador de projeto', sentiment: 'positive' },
  { label: 'Pode jogar acima', sentiment: 'positive' },
  { label: 'Destaca-se no escalão', sentiment: 'positive' },
  { label: 'Potencial limitado', sentiment: 'negative' },
];

/* ───────────── Exported Tag Getter ───────────── */

/** Get tags for a dimension, position-aware (GR gets specialized tags) */
export function getTagsForDimension(dimension: DimensionKey, isGoalkeeper: boolean): Tag[] {
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
