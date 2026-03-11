// src/components/players/ProfileFormWidgets.tsx
// Edit-mode form widgets used in PlayerProfile: DateInput, FootSelector, ShirtNumberInput, LinkCard, OpinionEditPills, ReferralPicker, ContactAssignPicker, EditPitchPicker.
// Extracted from PlayerProfile.tsx to reduce file size and improve modularity.
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/components/players/ProfileViewSections.tsx, src/components/players/profile-utils.ts

'use client';

import { useRef, useState } from 'react';
import { Calendar, Check, ChevronsUpDown, Loader2, Pencil, PenLine, Phone, Shirt, User, X } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { DEPARTMENT_OPINIONS } from '@/lib/constants';
import { formatDate } from '@/components/players/profile-utils';
import type { DepartmentOpinion, Foot, PositionCode } from '@/lib/types';

/* ───────────── DateInput — native date picker behind a styled button ───────────── */

/** Date input — shows formatted date as a tappable button that opens native date picker via hidden input */
export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const display = value ? formatDate(value) : '—';
  return (
    <div className="relative min-w-0">
      {/* Hidden native date input — positioned behind the visible button */}
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        tabIndex={-1}
      />
      {/* Visible tappable display */}
      <button
        type="button"
        onClick={() => ref.current?.showPicker?.()}
        className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent"
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span className={value ? 'text-xs font-medium tracking-wide text-neutral-600' : 'text-xs text-muted-foreground'}>{display}</span>
      </button>
    </div>
  );
}

/* ───────────── FootSvg + FootSelector — segmented control ───────────── */

/** Foot silhouette SVG — mirrored via scaleX for left foot */
export function FootSvg({ side, className }: { side: 'left' | 'right'; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 48"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      style={side === 'left' ? { transform: 'scaleX(-1)' } : undefined}
    >
      {/* Simplified foot silhouette — right foot base shape */}
      <path d="M16 2c-2 0-4 1-5.5 3C9 7 8 10 8 14c0 3-.5 6-1.5 9C5 27 4 30 4 33c0 4 1.5 7 4 9 2 1.5 5 2.5 8 2.5h2c3 0 5.5-1 7.5-3 1.5-1.5 2.5-4 2.5-6.5 0-3-1-5.5-2-8-1.5-3.5-2-7-2-11 0-4-.5-7-2-9.5C20.5 3.5 18.5 2 16 2z" />
      {/* Toes */}
      <ellipse cx="8" cy="33" rx="2.5" ry="3" />
      <ellipse cx="13" cy="31.5" rx="2" ry="2.5" />
      <ellipse cx="17.5" cy="31" rx="2" ry="2.5" />
      <ellipse cx="21.5" cy="32" rx="2" ry="2.5" />
      <ellipse cx="24.5" cy="34" rx="2" ry="2.5" />
    </svg>
  );
}

/** Interactive foot selector — tap left/right foot, both = ambidextrous. Matches input field height. */
export function FootSelector({ value, onChange }: { value: string; onChange: (v: Foot) => void }) {
  const isLeft = value === 'Esq' || value === 'Amb';
  const isRight = value === 'Dir' || value === 'Amb';

  function handleTap(side: 'left' | 'right') {
    if (side === 'left') {
      if (value === 'Esq') onChange('' as Foot);         // deselect left
      else if (value === 'Dir') onChange('Amb' as Foot);  // was right → both
      else if (value === 'Amb') onChange('Dir' as Foot);  // was both → just right
      else onChange('Esq' as Foot);                       // nothing → left
    } else {
      if (value === 'Dir') onChange('' as Foot);          // deselect right
      else if (value === 'Esq') onChange('Amb' as Foot);  // was left → both
      else if (value === 'Amb') onChange('Esq' as Foot);  // was both → just left
      else onChange('Dir' as Foot);                        // nothing → right
    }
  }

  // Label for current selection
  const label = value === 'Dir' ? 'Direito' : value === 'Esq' ? 'Esquerdo' : value === 'Amb' ? 'Ambidestro' : '';

  return (
    <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 shadow-sm">
      {/* Two tappable feet */}
      <div className="flex items-end gap-px">
        <button
          type="button"
          onClick={() => handleTap('left')}
          className={`rounded p-0.5 transition-all ${isLeft ? 'text-neutral-800' : 'text-neutral-300 hover:text-neutral-400'}`}
          title="Esquerdo"
        >
          <FootSvg side="left" className="h-5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleTap('right')}
          className={`rounded p-0.5 transition-all ${isRight ? 'text-neutral-800' : 'text-neutral-300 hover:text-neutral-400'}`}
          title="Direito"
        >
          <FootSvg side="right" className="h-5 w-3.5" />
        </button>
      </div>
      {/* Divider */}
      <div className="h-4 w-px bg-neutral-200" />
      {/* Label or placeholder */}
      {label
        ? <span className="text-xs font-medium tracking-wide text-neutral-600">{label}</span>
        : <span className="text-xs text-neutral-300">Escolher pé</span>
      }
    </div>
  );
}

/* ───────────── ShirtNumberInput ───────────── */

export function ShirtNumberInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Shirt className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="pl-8 text-xs font-medium tracking-wide text-neutral-600"
      />
    </div>
  );
}

/* ───────────── LinkCard — compact row for URL fields (photo, FPF, ZeroZero) ───────────── */

/** Compact link row: icon + label + status. Tap to expand inline URL input.
 *  isImage: when true, validates the URL loads as an image before confirming. */
export function LinkCard({ icon, label, value, onChange, isImage }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  isImage?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const hasValue = !!value;

  function normalizeUrl(raw: string): string {
    let url = raw.trim();
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    return url;
  }

  function handleConfirm() {
    const url = normalizeUrl(draft);
    if (!url || url === 'https://') return;

    if (isImage) {
      // Validate image loads before accepting
      setLoading(true);
      setStatus(null);
      const img = new window.Image();
      img.onload = () => {
        onChange(url);
        setDraft('');
        setExpanded(false);
        setLoading(false);
        setStatus(null);
      };
      img.onerror = () => {
        setLoading(false);
        setStatus('Imagem não carregou');
      };
      img.src = url;
    } else {
      onChange(url);
      setDraft('');
      setExpanded(false);
    }
  }

  function handleCancel() {
    setDraft('');
    setExpanded(false);
    setLoading(false);
    setStatus(null);
  }

  return (
    <div className={`rounded-lg border transition-colors ${
      hasValue ? 'border-green-200 bg-green-50/40' : 'border-neutral-200 bg-neutral-50/40'
    }`}>
      {/* Header — tappable to toggle input */}
      <button
        type="button"
        onClick={() => { if (!expanded) { setDraft(''); setStatus(null); setExpanded(true); } else handleCancel(); }}
        className="flex w-full items-center gap-2.5 px-3 py-2"
      >
        {/* Icon / preview */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-neutral-200/60">
          {icon}
        </div>
        {/* Label + status */}
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs font-medium text-neutral-600">{label}</p>
          <p className={`text-[10px] ${hasValue ? 'font-medium text-green-600' : 'text-neutral-400'}`}>
            {hasValue ? 'Ligado' : 'Sem link'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasValue && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Remover este link?')) onChange('');
              }}
              className="rounded-md p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Remover"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <Pencil className={`h-3 w-3 transition-colors ${expanded ? 'text-neutral-600' : 'text-neutral-300'}`} />
        </div>
      </button>
      {/* Expandable input — type URL then confirm */}
      {expanded && (
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="url"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setStatus(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') handleCancel(); }}
              placeholder={hasValue ? 'Novo URL...' : 'URL...'}
              className="min-w-0 flex-1 bg-transparent font-mono text-[9px] tracking-wider text-neutral-500 outline-none placeholder:text-neutral-300"
              autoFocus
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || !/^(https?:\/\/)?.+\..+/.test(draft.trim())}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </button>
          </div>
          {status && (
            <p className="mt-1 text-[10px] text-neutral-400">{status}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Opinion Edit Pills — colored toggle pills ───────────── */

/** Colored opinion pills for edit mode: selected shows tinted bg + solid border, unselected shows dashed border */
export const OPINION_EDIT_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  '1ª Escolha':       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-300',   dot: 'bg-blue-500' },
  '2ª Escolha':       { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-300', dot: 'bg-orange-500' },
  'Acompanhar':       { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-300', dot: 'bg-yellow-500' },
  'Por Observar':     { bg: 'bg-neutral-100', text: 'text-neutral-600', border: 'border-neutral-300', dot: 'bg-neutral-400' },
  'Urgente Observar': { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-300', dot: 'bg-orange-500' },
  'Sem interesse':    { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-300',    dot: 'bg-red-500' },
  'Potencial':        { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-300', dot: 'bg-purple-500' },
  'Assinar':          { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-300',  dot: 'bg-green-500' },
};
export const OPINION_EDIT_DEFAULT = { bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-200', dot: 'bg-neutral-400' };

export function OpinionEditPills({ selected, onChange }: { selected: DepartmentOpinion[]; onChange: (v: DepartmentOpinion[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DEPARTMENT_OPINIONS.map((o) => {
        const checked = selected.includes(o.value);
        const s = OPINION_EDIT_STYLES[o.value] ?? OPINION_EDIT_DEFAULT;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              const next = checked
                ? selected.filter((v) => v !== o.value)
                : [...selected, o.value];
              onChange(next as DepartmentOpinion[]);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
              checked
                ? `${s.bg} ${s.border} ${s.text} shadow-sm`
                : 'border-dashed border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-500'
            }`}
          >
            {/* Colored dot — only when selected */}
            {checked && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />}
            {o.value}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Referral Picker — combobox with profiles + free text ───────────── */

/** Combobox: select a registered user OR type free text. Clear button to remove. */
export function ReferralPicker({ profiles, selectedUserId, freeText, onChange }: {
  profiles: { id: string; fullName: string }[];
  selectedUserId: string | null;
  freeText: string;
  onChange: (userId: string | null, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Display name: linked user's name, or free text
  const linkedProfile = selectedUserId ? profiles.find((p) => p.id === selectedUserId) : null;
  const displayName = linkedProfile?.fullName || freeText;
  const isLinked = !!linkedProfile;

  function handleSelectProfile(profile: { id: string; fullName: string }) {
    onChange(profile.id, profile.fullName);
    setOpen(false);
    setSearch('');
  }

  function handleFreeText() {
    if (search.trim()) {
      onChange(null, search.trim());
      setOpen(false);
      setSearch('');
    }
  }

  function handleClear() {
    onChange(null, '');
  }

  // Filtered profiles based on search
  const filtered = profiles.filter((p) => !search || p.fullName.toLowerCase().includes(search.toLowerCase()));
  const hasExactMatch = profiles.some((p) => p.fullName.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="flex items-center gap-1.5">
      {/* Trigger button — opens dialog */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 shadow-sm transition-colors hover:bg-accent"
      >
        <User className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        {displayName ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <span className="truncate text-xs font-medium tracking-wide text-neutral-600">{displayName}</span>
            {isLinked && <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-bold text-blue-600">LINKED</span>}
          </span>
        ) : (
          <span className="flex-1 text-left text-xs text-neutral-300">Quem referenciou</span>
        )}
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-neutral-300" />
      </button>
      {/* Search dialog — works well on mobile (no popover/keyboard issues) */}
      <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
        <CommandInput
          placeholder="Pesquisar utilizador ou escrever nome..."
          value={search}
          onValueChange={setSearch}
          onClear={() => setSearch('')}
        />
        <CommandList>
          <CommandEmpty>
            {search.trim() ? (
              <button
                type="button"
                onClick={handleFreeText}
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
              >
                Adicionar <strong>&quot;{search.trim()}&quot;</strong> como referência externa
              </button>
            ) : (
              'Sem resultados'
            )}
          </CommandEmpty>
          {/* Registered users */}
          {filtered.length > 0 && (
            <CommandGroup heading="Utilizadores">
              {filtered.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.fullName}
                  onSelect={() => handleSelectProfile(p)}
                >
                  <User className="mr-2 h-4 w-4 text-neutral-400" />
                  {p.fullName}
                  {p.id === selectedUserId && <Check className="ml-auto h-4 w-4 text-blue-500" />}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {/* Free text option */}
          {search.trim() && !hasExactMatch && (
            <CommandGroup heading="Outro">
              <CommandItem onSelect={handleFreeText} value={`__free__${search}`}>
                <PenLine className="mr-2 h-4 w-4 text-neutral-400" />
                Adicionar &quot;{search.trim()}&quot;
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
      {/* Clear button */}
      {displayName && (
        <button
          type="button"
          onClick={handleClear}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input text-neutral-400 transition-colors hover:bg-accent hover:text-neutral-600"
          title="Remover referência"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ───────────── Contact Assignment Picker — simple user dropdown ───────────── */

export function ContactAssignPicker({ profiles, selectedUserId, onChange }: {
  profiles: { id: string; fullName: string }[];
  selectedUserId: string | null;
  onChange: (userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = selectedUserId ? profiles.find((p) => p.id === selectedUserId) : null;
  const filtered = profiles.filter((p) => !search || p.fullName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 shadow-sm transition-colors hover:bg-accent"
      >
        <Phone className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        {selected ? (
          <span className="flex-1 truncate text-left text-xs font-medium tracking-wide text-neutral-600">{selected.fullName}</span>
        ) : (
          <span className="flex-1 text-left text-xs text-neutral-300">Quem vai contactar</span>
        )}
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-neutral-300" />
      </button>
      <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
        <CommandInput
          placeholder="Pesquisar utilizador..."
          value={search}
          onValueChange={setSearch}
          onClear={() => setSearch('')}
        />
        <CommandList>
          <CommandEmpty>Sem resultados</CommandEmpty>
          <CommandGroup heading="Utilizadores">
            {filtered.map((p) => (
              <CommandItem
                key={p.id}
                value={p.fullName}
                onSelect={() => { onChange(p.id); setOpen(false); setSearch(''); }}
              >
                <User className="mr-2 h-4 w-4 text-neutral-400" />
                {p.fullName}
                {p.id === selectedUserId && <Check className="ml-auto h-4 w-4 text-blue-500" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      {selected && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input text-neutral-400 transition-colors hover:bg-accent hover:text-neutral-600"
          title="Remover responsável"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ───────────── Interactive Pitch Position Picker ───────────── */

/** Position coordinates on a horizontal pitch (percentage-based) */
export const EDIT_PITCH_POSITIONS: Record<PositionCode, { x: number; y: number }> = {
  GR:  { x: 8,  y: 50 },
  DD:  { x: 24, y: 82 },
  DC:  { x: 22, y: 50 },
  DE:  { x: 24, y: 18 },
  MDC: { x: 35, y: 50 },
  AD:  { x: 36, y: 88 },
  MD:  { x: 50, y: 82 },
  MC:  { x: 50, y: 50 },
  ME:  { x: 50, y: 18 },
  AE:  { x: 36, y: 12 },
  MOC: { x: 62.5, y: 50 },
  ED:  { x: 72, y: 86 },
  EE:  { x: 72, y: 14 },
  SA:  { x: 80, y: 50 },
  PL:  { x: 88, y: 50 },
};

export function EditPitchPicker({ primary, secondary, tertiary, onPrimaryChange, onSecondaryChange, onTertiaryChange }: {
  primary: PositionCode | '';
  secondary: PositionCode | null;
  tertiary: PositionCode | null;
  onPrimaryChange: (v: string) => void;
  onSecondaryChange: (v: string | null) => void;
  onTertiaryChange: (v: string | null) => void;
}) {
  function handleClick(pos: PositionCode) {
    // If already selected at any level, remove it
    if (pos === primary) { onPrimaryChange(''); return; }
    if (pos === secondary) { onSecondaryChange(null); return; }
    if (pos === tertiary) { onTertiaryChange(null); return; }
    // Assign to first available slot
    if (!primary) { onPrimaryChange(pos); return; }
    if (!secondary) { onSecondaryChange(pos); return; }
    if (!tertiary) { onTertiaryChange(pos); return; }
    // All 3 filled — replace tertiary
    onTertiaryChange(pos);
  }

  function getLevel(pos: PositionCode): 'primary' | 'secondary' | 'tertiary' | null {
    if (pos === primary) return 'primary';
    if (pos === secondary) return 'secondary';
    if (pos === tertiary) return 'tertiary';
    return null;
  }

  const levelStyles = {
    primary:   'bg-green-500 border-white shadow-md shadow-green-500/40 scale-125',
    secondary: 'bg-yellow-400 border-white shadow-md shadow-yellow-400/40 scale-110',
    tertiary:  'bg-orange-400 border-white shadow-md shadow-orange-400/40 scale-110',
  };

  return (
    <div className="relative h-60 w-full max-w-md overflow-hidden rounded-lg bg-emerald-700/90">
      {/* Pitch markings */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-1.5 rounded-sm border border-white/20" />
        <div className="absolute inset-y-1.5 left-1/2 border-l border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-[25%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
        <div className="absolute left-1.5 top-1/2 h-[45%] w-[12%] -translate-y-1/2 border-y border-r border-white/20" />
        <div className="absolute left-1.5 top-1/2 h-[25%] w-[6%] -translate-y-1/2 border-y border-r border-white/20" />
        <div className="absolute right-1.5 top-1/2 h-[45%] w-[12%] -translate-y-1/2 border-y border-l border-white/20" />
        <div className="absolute right-1.5 top-1/2 h-[25%] w-[6%] -translate-y-1/2 border-y border-l border-white/20" />
      </div>
      {/* Clickable position dots */}
      {(Object.entries(EDIT_PITCH_POSITIONS) as [PositionCode, { x: number; y: number }][]).map(([pos, coords]) => {
        const level = getLevel(pos);
        return (
          <button
            key={pos}
            type="button"
            onClick={() => handleClick(pos)}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
          >
            <div className="flex flex-col items-center">
              <div className={`rounded-full border-2 transition-all ${level ? `h-5 w-5 ${levelStyles[level]}` : 'h-3 w-3 bg-white/30 border-transparent group-hover:bg-white/60 group-hover:scale-125'}`} />
              <span className={`mt-0.5 text-[9px] font-bold leading-none drop-shadow-sm transition-colors ${level ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}>{pos}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
