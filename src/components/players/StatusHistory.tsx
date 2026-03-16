// src/components/players/StatusHistory.tsx
// Timeline of player status changes — icon circles, colored badges, two-line entries
// Mobile-first compact design with show-more for long histories
// RELEVANT FILES: src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx, src/lib/types/index.ts

'use client';

import { useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  Shield,
  ShieldOff,
  User,
  Users,
  UserMinus,
  MapPin,
  Star,
  ClipboardList,
  Calendar,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { RECRUITMENT_LABEL_MAP, RECRUITMENT_STATUS_MAP, POSITION_LABELS, getAgeGroups } from '@/lib/constants';
import type { StatusHistoryEntry, RecruitmentStatus, PositionCode } from '@/lib/types';

interface StatusHistoryProps {
  entries: StatusHistoryEntry[];
  maxVisible?: number;
  canDelete?: boolean;
  onDelete?: (entryId: number) => void;
}

const MAX_VISIBLE_DEFAULT = 4;

/* ───────────── Formatting helpers ───────────── */

/** Map DC sub-slots to readable labels */
const SLOT_LABELS: Record<string, string> = {
  DC_E: 'Defesa Central (E)',
  DC_D: 'Defesa Central (D)',
};

function posLabel(v: string | null): string {
  if (!v) return '—';
  return POSITION_LABELS[v as PositionCode] ?? SLOT_LABELS[v] ?? v;
}

function recruitLabel(v: string | null): string {
  if (!v) return '—';
  return RECRUITMENT_LABEL_MAP[v as RecruitmentStatus] ?? v;
}

/** Tailwind classes for a recruitment status mini-badge */
function recruitBadgeClass(v: string | null): string {
  if (!v) return 'bg-neutral-100 text-neutral-500';
  const tw = RECRUITMENT_STATUS_MAP[v as RecruitmentStatus];
  return tw ?? 'bg-neutral-100 text-neutral-500';
}

function fmtDateTime(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('pt-PT', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return v; }
}

function fmtRelative(v: string): string {
  try {
    const d = new Date(v);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `há ${diffMin}min`;
    if (diffH < 24) return `há ${diffH}h`;
    if (diffD === 1) return 'há 1 dia';
    if (diffD < 7) return `há ${diffD} dias`;
    // Absolute date for older entries
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return v; }
}

/** Convert shadow squad tag from escalão to generation year: "Sombra Sub-14" → "Sombra 2012" */
function shadowTagToYear(tag: string): string {
  const match = tag.match(/^(Sombra)\s+(Sub-(\d+))$/i);
  if (!match) return tag;
  const n = parseInt(match[3], 10);
  // Find the generation year for this escalão from constants
  const ag = getAgeGroups().find((g) => g.name === match[2]);
  if (ag) return `${match[1]} ${ag.generationYear}`;
  // Fallback: shouldn't happen but compute manually
  const now = new Date();
  const endYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `${match[1]} ${endYear - n}`;
}

/* ───────────── Entry display builder ───────────── */

interface EntryDisplay {
  icon: React.ReactNode;
  /** bg + text classes for the icon circle */
  iconBg: string;
  /** border-l color class for the entry card accent */
  accent: string;
  content: React.ReactNode;
}

const IC = 'h-3.5 w-3.5';

function buildDisplay(e: StatusHistoryEntry): EntryDisplay {
  const { fieldChanged, oldValue, newValue, notes } = e;

  switch (fieldChanged) {
    /* ── Recruitment status ── */
    case 'recruitment_status': {
      // Resolve contact purpose label for display
      const purposeLabel = e.contactPurposeLabel ?? e.contactPurposeCustom ?? null;
      return {
        icon: <ArrowRightLeft className={IC} />,
        iconBg: 'bg-blue-50 text-blue-600',
        accent: 'border-l-blue-400',
        content: (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-block rounded-full px-2 py-px text-[11px] font-medium ${recruitBadgeClass(oldValue)}`}>
              {recruitLabel(oldValue)}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className={`inline-block rounded-full px-2 py-px text-[11px] font-medium ${recruitBadgeClass(newValue)}`}>
              {recruitLabel(newValue)}
            </span>
            {purposeLabel && (
              <span className="inline-block rounded bg-blue-50 px-1.5 py-px text-[10px] font-medium text-blue-700">
                {purposeLabel}
              </span>
            )}
            {notes && <span className="text-xs text-muted-foreground">— {notes}</span>}
          </div>
        ),
      };
    }

    /* ── Shadow squad ── */
    case 'is_shadow_squad': {
      const added = newValue === 'true';
      const posMatch = notes?.match(/posição\s+(\S+)/i);
      const pos = posMatch ? posLabel(posMatch[1]) : null;
      const wasPos = notes?.match(/era\s+([A-Z]+)/i);
      const oldPos = wasPos ? posLabel(wasPos[1]) : null;
      return {
        icon: added ? <Shield className={IC} /> : <ShieldOff className={IC} />,
        iconBg: added ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-500',
        accent: added ? 'border-l-purple-400' : 'border-l-red-300',
        content: added
          ? (
            <span className="text-sm">
              Adicionado ao <span className="font-medium">Plantel Sombra</span>
              {pos && <> como <span className="inline-block rounded bg-purple-50 px-1.5 py-px text-xs font-medium text-purple-700">{pos}</span></>}
            </span>
          )
          : (
            <span className="text-sm text-muted-foreground">
              Removido do Plantel Sombra{oldPos && <> ({oldPos})</>}
            </span>
          ),
      };
    }

    /* ── Real squad ── */
    case 'is_real_squad': {
      const added = newValue === 'true';
      const posMatch = notes?.match(/posição\s+(\S+)/i);
      const pos = posMatch ? posLabel(posMatch[1]) : null;
      return {
        icon: added ? <Users className={IC} /> : <UserMinus className={IC} />,
        iconBg: added ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500',
        accent: added ? 'border-l-green-400' : 'border-l-red-300',
        content: added
          ? (
            <span className="text-sm">
              Adicionado ao <span className="font-medium">Plantel</span>
              {pos && <> como <span className="inline-block rounded bg-green-50 px-1.5 py-px text-xs font-medium text-green-700">{pos}</span></>}
            </span>
          )
          : <span className="text-sm text-muted-foreground">Removido do Plantel</span>,
      };
    }

    /* ── Position change (squad slot) ── */
    case 'shadow_position':
    case 'real_squad_position':
    case 'position_normalized': {
      // New format: notes = "Sombra Sub-14" or "Plantel Sub-15"
      // Old format: notes = "Movido de X para Y" or "Plantel Sombra: movido de X para Y"
      const isSombra = fieldChanged === 'shadow_position';
      let squadTag = isSombra ? 'Sombra' : 'Plantel';
      if (notes) {
        // New format — short squad label without "movido"
        if (!notes.toLowerCase().includes('movido')) {
          squadTag = notes;
        } else {
          // Old format — try to extract squad prefix
          const prefixMatch = notes.match(/^((?:Sombra|Plantel)\s+Sub-\d+|Plantel Sombra|Plantel)/i);
          if (prefixMatch) squadTag = prefixMatch[1];
        }
      }
      // Shadow squads use generation year, not escalão
      if (isSombra) squadTag = shadowTagToYear(squadTag);
      const isFirstAssignment = !oldValue;
      return {
        icon: <MapPin className={IC} />,
        iconBg: 'bg-orange-50 text-orange-600',
        accent: 'border-l-orange-400',
        content: isFirstAssignment
          ? (
            <span className="text-sm">
              Posição definida: <span className="inline-block rounded bg-orange-50 px-1.5 py-px text-xs font-medium text-orange-700">{posLabel(newValue)}</span>
              <span className={`ml-1 inline-block rounded px-1.5 py-px text-[10px] font-medium ${isSombra ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>{squadTag}</span>
            </span>
          )
          : (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="inline-block rounded bg-neutral-100 px-1.5 py-px text-xs font-medium">{posLabel(oldValue)}</span>
              <span className="text-muted-foreground">→</span>
              <span className="inline-block rounded bg-orange-50 px-1.5 py-px text-xs font-medium text-orange-700">{posLabel(newValue)}</span>
              <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${isSombra ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>{squadTag}</span>
            </div>
          ),
      };
    }

    /* ── Department opinion ── */
    case 'department_opinion': {
      const newPills = parseOpinionArray(newValue);
      return {
        icon: <Star className={IC} />,
        iconBg: 'bg-yellow-50 text-yellow-600',
        accent: 'border-l-yellow-400',
        content: (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="inline-block rounded bg-neutral-100 px-1.5 py-px text-xs font-medium">Opinião atualizada</span>
            {newPills.map((op) => (
              <span key={op} className="inline-block rounded bg-yellow-50 px-1.5 py-px text-[11px] font-medium text-yellow-700">{op}</span>
            ))}
          </div>
        ),
      };
    }

    /* ── Meeting date ── */
    case 'meeting_date':
      return {
        icon: <Calendar className={IC} />,
        iconBg: 'bg-orange-50 text-orange-600',
        accent: 'border-l-orange-400',
        content: newValue
          ? (
            <span className="text-sm">
              Reunião marcada para <span className="font-medium">{fmtDateTime(newValue)}</span>
            </span>
          )
          : <span className="text-sm text-muted-foreground">Reunião desmarcada</span>,
      };

    /* ── Training date ── */
    case 'training_date':
      return {
        icon: <Calendar className={IC} />,
        iconBg: 'bg-blue-50 text-blue-600',
        accent: 'border-l-blue-400',
        content: newValue
          ? (
            <span className="text-sm">
              Treino marcado para <span className="font-medium">{fmtDateTime(newValue)}</span>
            </span>
          )
          : <span className="text-sm text-muted-foreground">Treino desmarcado</span>,
      };

    /* ── Signing date ── */
    case 'signing_date':
      return {
        icon: <Calendar className={IC} />,
        iconBg: 'bg-green-50 text-green-600',
        accent: 'border-l-green-400',
        content: newValue
          ? (
            <span className="text-sm">
              Assinatura marcada para <span className="font-medium">{fmtDateTime(newValue)}</span>
            </span>
          )
          : <span className="text-sm text-muted-foreground">Assinatura desmarcada</span>,
      };

    /* ── Decision date ── */
    case 'decision_date':
      return {
        icon: <Calendar className={IC} />,
        iconBg: 'bg-indigo-50 text-indigo-600',
        accent: 'border-l-indigo-400',
        content: newValue
          ? (
            <span className="text-sm">
              Prazo de decisão: <span className="font-medium">{fmtDateTime(newValue)}</span>
            </span>
          )
          : <span className="text-sm text-muted-foreground">Prazo de decisão removido</span>,
      };

    /* ── Club ── */
    case 'club':
      return {
        icon: <Shield className={IC} />,
        iconBg: 'bg-cyan-50 text-cyan-600',
        accent: 'border-l-cyan-400',
        content: (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Clube</span>
            <span className="inline-block rounded bg-neutral-100 px-1.5 py-px text-xs">{oldValue || '—'}</span>
            <span className="text-muted-foreground">→</span>
            <span className="inline-block rounded bg-cyan-50 px-1.5 py-px text-xs font-medium text-cyan-700">{newValue || '—'}</span>
          </div>
        ),
      };

    /* ── Observer decision ── */
    case 'observer_decision':
      return {
        icon: <ClipboardList className={IC} />,
        iconBg: 'bg-indigo-50 text-indigo-600',
        accent: 'border-l-indigo-400',
        content: (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Decisão</span>
            <span className="inline-block rounded bg-neutral-100 px-1.5 py-px text-xs">{oldValue || '—'}</span>
            <span className="text-muted-foreground">→</span>
            <span className="inline-block rounded bg-indigo-50 px-1.5 py-px text-xs font-medium text-indigo-700">{newValue || '—'}</span>
          </div>
        ),
      };

    /* ── Decision side (A Decidir sub-sections) ── */
    case 'decision_side': {
      const isClub = newValue === 'club';
      const sideLabel = isClub ? 'Clube a decidir' : 'Jogador a decidir';
      const SideIcon = isClub ? Building2 : User;
      return {
        icon: <SideIcon className={IC} />,
        iconBg: isClub ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600',
        accent: isClub ? 'border-l-blue-400' : 'border-l-purple-400',
        content: (
          <span className="text-sm">
            Alterado para <span className="font-medium">{sideLabel}</span>
          </span>
        ),
      };
    }

    /* ── Fallback ── */
    default:
      return {
        icon: <ArrowRightLeft className={IC} />,
        iconBg: 'bg-neutral-100 text-neutral-500',
        accent: 'border-l-neutral-300',
        content: (
          <span className="text-sm text-muted-foreground">
            {fieldChanged}: {oldValue || '—'} → {newValue || '—'}
          </span>
        ),
      };
  }
}

/* ───────────── Component ───────────── */

/** Filter out noise and deduplicate consecutive entries */
function dedup(entries: StatusHistoryEntry[]): StatusHistoryEntry[] {
  return entries.filter((e, i) => {
    // Skip meaningless changes (empty to empty, [] to null, etc.)
    const oldNorm = normalizeEmpty(e.oldValue);
    const newNorm = normalizeEmpty(e.newValue);
    if (oldNorm === newNorm) return false;

    // Deduplicate consecutive entries with same field+old+new
    if (i === 0) return true;
    const prev = entries[i - 1];
    return !(
      e.fieldChanged === prev.fieldChanged &&
      e.oldValue === prev.oldValue &&
      e.newValue === prev.newValue
    );
  });
}

/** Normalize empty-ish values for comparison: null, '', '[]', '—' all become null */
function normalizeEmpty(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  if (trimmed === '' || trimmed === '[]' || trimmed === '—') return null;
  return trimmed;
}

/** Parse opinion value into individual pills — handles JSON arrays and comma-separated strings */
function parseOpinionArray(v: string | null | undefined): string[] {
  const norm = normalizeEmpty(v);
  if (!norm) return [];
  if (norm.startsWith('[')) {
    try {
      const arr = JSON.parse(norm) as string[];
      if (Array.isArray(arr)) return arr.filter(Boolean);
    } catch { /* not JSON */ }
  }
  // Comma-separated fallback
  return norm.split(',').map((s) => s.trim()).filter(Boolean);
}

export function StatusHistory({ entries, maxVisible = MAX_VISIBLE_DEFAULT, canDelete, onDelete }: StatusHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  const cleaned = dedup(entries);

  if (cleaned.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem histórico.</p>;
  }

  const visible = expanded ? cleaned : cleaned.slice(0, maxVisible);
  const hiddenCount = cleaned.length - maxVisible;

  return (
    <div className="space-y-1.5">
      {visible.map((entry) => {
        const d = buildDisplay(entry);

        return (
          <div
            key={entry.id}
            className={`flex items-start gap-2.5 rounded-md border-l-[3px] bg-neutral-50/60 px-3 py-2 ${d.accent}`}
          >
            {/* Icon circle */}
            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${d.iconBg}`}>
              {d.icon}
            </div>

            {/* Content + metadata */}
            <div className="min-w-0 flex-1">
              <div>{d.content}</div>
              {/* suppressHydrationWarning: fmtRelative uses Date.now() which differs server vs client */}
              <p className="mt-0.5 text-[11px] text-muted-foreground" suppressHydrationWarning>
                {entry.changedByName} &middot; {fmtRelative(entry.createdAt)}
              </p>
            </div>

            {/* Delete button — admin only */}
            {canDelete && onDelete && (
              <button
                className="shrink-0 rounded p-1 text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500"
                onClick={() => onDelete(entry.id)}
                aria-label="Apagar entrada"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Show more / less toggle */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-solid hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Mais {hiddenCount} alterações
            </>
          )}
        </button>
      )}
    </div>
  );
}
