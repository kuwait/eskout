// src/components/players/RefreshPlayerButton.tsx
// Single "Atualizar Atleta" button that scrapes FPF + ZeroZero, merges data, shows confirmation popup
// Separates FPF-sourced vs ZZ-sourced data — ZZ data disabled until user confirms ZZ link
// RELEVANT FILES: src/actions/scraping.ts, src/components/players/PlayerProfile.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Check, RefreshCw, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { scrapePlayerAll, applyScrapedData, type ScrapedChanges, type PreFetchedZz } from '@/actions/scraping';
import { fetchZzProfileClient, searchZzMultiStrategyClient } from '@/lib/zerozero/client';
import { calcAgeFromDob } from '@/lib/zerozero/helpers';
import { POSITIONS } from '@/lib/constants';
import type { Player } from '@/lib/types';

interface RefreshPlayerButtonProps {
  player: Player;
}

export function RefreshPlayerButton({ player }: RefreshPlayerButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [isApplying, startApply] = useTransition();
  const [result, setResult] = useState<ScrapedChanges | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Track which changes the user wants to apply
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  // Track which photo source the user picked ('fpf' | 'zz' | null)
  const [photoSource, setPhotoSource] = useState<'fpf' | 'zz' | null>(null);
  // User-overridden positions when ZZ returns unknown position text (dropdown selection)
  const [posOverrides, setPosOverrides] = useState<{ primary?: string; secondary?: string; tertiary?: string }>({});
  // Store client-fetched ZZ profile data so handleApply can pass it to applyScrapedData
  const [zzProfileCache, setZzProfileCache] = useState<import('@/lib/zerozero/parser').ZzParsedProfile | null>(null);

  // Only show if the player has at least one external link
  if (!player.fpfLink && !player.zerozeroLink) return null;

  // Whether ZZ data is trusted (either pre-existing link or user selected the auto-found link)
  const zzEnabled = result?.zzConfirmed || !!selected.zzLink;

  function handleRefresh() {
    setFeedback(null);
    startTransition(async () => {
      // Fetch ZZ data client-side (via Edge proxy) to avoid server IP blocking
      const preZz: PreFetchedZz = { profileData: null, searchCandidate: null, blocked: false, searchAttempted: false };
      try {
        if (player.zerozeroLink) {
          // Player has confirmed ZZ link — fetch profile client-side
          preZz.profileData = await fetchZzProfileClient(player.zerozeroLink);
        } else if (player.name && player.dob) {
          // No ZZ link — search client-side
          preZz.searchAttempted = true;
          const age = calcAgeFromDob(player.dob);
          const candidate = await searchZzMultiStrategyClient(player.name, player.club || null, age, player.dob);
          if (candidate) {
            preZz.searchCandidate = candidate;
            // Also fetch the found profile
            preZz.profileData = await fetchZzProfileClient(candidate.url).catch(() => null);
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message === 'ZZ_BLOCKED') preZz.blocked = true;
      }

      // Cache ZZ profile for handleApply (when user confirms ZZ link, we pass it to avoid re-fetch)
      setZzProfileCache(preZz.profileData);

      // Server action handles FPF + DB + merge (ZZ data already pre-fetched)
      const res = await scrapePlayerAll(player.id, preZz);
      setResult(res);

      if (!res.success) {
        setFeedback(res.errors.length > 0 ? `Erro: ${res.errors.join(', ')}` : 'Erro ao aceder aos dados externos');
        return;
      }

      if (res.hasChanges) {
        // Pre-select FPF-sourced changes. ZZ-sourced: only if ZZ link is confirmed (pre-existing)
        const sel: Record<string, boolean> = {};
        if (res.clubChanged) sel.club = true;
        if (res.clubLogoChanged) sel.clubLogo = true;
        // FPF photo: always pre-select if available
        if (res.fpfPhotoUrl) sel.photo = true;
        else if (res.hasNewPhoto) sel.photo = true;
        if (res.birthCountryChanged) sel.birthCountry = true;
        if (res.nationalityChanged) sel.nationality = true;
        // ZZ-only fields: pre-select only if ZZ link was already confirmed
        if (res.zzConfirmed) {
          if (res.heightChanged) sel.height = true;
          if (res.weightChanged) sel.weight = true;
          if (res.positionChanged) sel.position = true;
          if (res.footChanged) sel.foot = true;
        }
        // Auto-found ZZ link: NOT pre-selected — user must confirm
        if (res.zzLinkFound) sel.zzLink = false;
        setSelected(sel);
        setPosOverrides({});
        // Default photo source: FPF if available (most reliable), ZZ only if confirmed
        setPhotoSource(res.fpfPhotoUrl ? 'fpf' : res.zzPhotoUrl && res.zzConfirmed ? 'zz' : null);
        setShowDialog(true);
      } else if (res.errors.length > 0) {
        // No changes but partial errors — show warning (e.g. ZZ blocked)
        setFeedback(res.errors.join('. '));
        setTimeout(() => setFeedback(null), 5000);
      } else {
        setFeedback('ok');
        setTimeout(() => setFeedback(null), 2000);
      }
    });
  }

  function handleApply() {
    if (!result) return;
    startApply(async () => {
      const updates: Parameters<typeof applyScrapedData>[1] = {};
      if (selected.club && result.club) updates.club = result.club;
      if (selected.clubLogo && result.clubLogoUrl) updates.clubLogoUrl = result.clubLogoUrl;
      // Photo: apply whichever source the user picked
      if (selected.photo && photoSource) {
        const photoUrl = photoSource === 'zz' ? result.zzPhotoUrl : result.fpfPhotoUrl;
        if (photoUrl) updates.photoUrl = photoUrl;
      }
      if (selected.birthCountry && result.birthCountry) updates.birthCountry = result.birthCountry;
      if (selected.nationality && result.nationality) updates.nationality = result.nationality;
      // ZZ-only fields: only apply if ZZ is enabled
      if (zzEnabled) {
        if (selected.height && result.height) updates.height = result.height;
        if (selected.weight && result.weight) updates.weight = result.weight;
        if (selected.position) {
          // Use overrides (from dropdown) if set, otherwise use normalized codes
          const primary = posOverrides.primary || result.position || null;
          const secondary = posOverrides.secondary || result.secondaryPosition || null;
          const tertiary = posOverrides.tertiary || result.tertiaryPosition || null;
          if (primary) updates.position = primary;
          if (secondary) updates.secondaryPosition = secondary;
          if (tertiary) updates.tertiaryPosition = tertiary;
        }
        if (selected.foot && result.foot) updates.foot = result.foot;
      }
      // Only apply ZZ link if user explicitly confirmed it
      if (selected.zzLink && result.zzLinkFound) updates.zzLinkFound = result.zzLinkFound;

      // Pass cached ZZ profile so applyScrapedData doesn't need to re-fetch from ZZ
      await applyScrapedData(player.id, updates, zzProfileCache);
      setShowDialog(false);
      setFeedback('Dados atualizados');
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  function toggleField(field: string) {
    setSelected((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  // When user toggles ZZ link on, auto-select ZZ-only fields; when off, deselect them
  function toggleZzLink() {
    setSelected((prev) => {
      const newZz = !prev.zzLink;
      const next: Record<string, boolean> = { ...prev, zzLink: newZz };
      if (result) {
        if (newZz) {
          // Auto-select ZZ fields when enabling
          if (result.heightChanged) next.height = true;
          if (result.weightChanged) next.weight = true;
          if (result.positionChanged) next.position = true;
          if (result.footChanged) next.foot = true;
          // Auto-select ZZ photo when confirming ZZ link
          if (result.zzPhotoUrl) {
            next.photo = true;
            setPhotoSource('zz');
          }
        } else {
          // Deselect ZZ fields when disabling
          next.height = false;
          next.weight = false;
          next.position = false;
          next.foot = false;
          // Revert photo to FPF if available, or deselect
          if (photoSource === 'zz') {
            if (result.fpfPhotoUrl) {
              setPhotoSource('fpf');
            } else {
              next.photo = false;
              setPhotoSource(null);
            }
          }
        }
      }
      return next;
    });
  }

  const anySelected = Object.values(selected).some(Boolean);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isPending || feedback === 'ok'}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground hover:shadow-sm disabled:opacity-50"
      >
        {feedback === 'ok' ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        )}
        <span className="hidden sm:inline">{isPending ? 'A verificar...' : feedback === 'ok' ? 'Sem alterações' : 'Atualizar'}</span>
      </button>
      {/* Show partial errors as toast-like warning below button */}
      {feedback && feedback !== 'ok' && (
        <p className="absolute top-full mt-1 right-0 z-50 whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 shadow-sm">
          ⚠ {feedback}
        </p>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novos dados encontrados</DialogTitle>
            <DialogDescription>Seleciona os dados que queres atualizar.</DialogDescription>
          </DialogHeader>
          {/* Partial errors (e.g. ZZ blocked but FPF ok) */}
          {result?.errors && result.errors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ {result.errors.join('. ')}
            </div>
          )}
          <div className="space-y-3 text-sm">
            {/* ── FPF-sourced fields (always visible) ── */}
            {result?.clubChanged && result.club && (
              <ChangeRow
                checked={!!selected.club}
                onToggle={() => toggleField('club')}
                label="Clube"
                oldValue={player.club || '—'}
                newValue={result.club}
              />
            )}
            {result?.clubLogoChanged && result.clubLogoUrl && (
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={!!selected.clubLogo} onCheckedChange={() => toggleField('clubLogo')} className="mt-0.5" />
                <div>
                  <p className="font-medium">Logo Clube</p>
                  {player.clubLogoUrl ? (
                    <div className="mt-1 flex items-center gap-3">
                      <Image src={player.clubLogoUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" unoptimized />
                      <span className="text-muted-foreground">→</span>
                      <Image src={result.clubLogoUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" unoptimized />
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5">
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">Novo</span>
                      <Image src={result.clubLogoUrl} alt="" width={24} height={24} className="h-6 w-6 shrink-0 object-contain" unoptimized />
                    </p>
                  )}
                </div>
              </label>
            )}
            {result?.hasNewPhoto && (result.fpfPhotoUrl || (result.zzPhotoUrl && zzEnabled)) && (
              <div className="flex items-start gap-2">
                <Checkbox checked={!!selected.photo} onCheckedChange={() => { toggleField('photo'); if (selected.photo) setPhotoSource(null); }} className="mt-0.5 cursor-pointer" />
                <div className="w-full">
                  <p className="font-medium cursor-pointer" onClick={() => { toggleField('photo'); if (selected.photo) setPhotoSource(null); }}>Foto</p>
                  <div className="mt-1 flex items-center gap-3">
                    {/* Current photo or placeholder */}
                    {player.photoUrl || player.zzPhotoUrl ? (
                      <Image src={player.photoUrl || player.zzPhotoUrl!} alt="" width={64} height={64} className="h-16 w-16 rounded-lg border object-cover" unoptimized />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-neutral-100">
                        <User className="h-6 w-6 text-neutral-300" />
                      </div>
                    )}
                    <span className="text-muted-foreground">→</span>
                    {/* Photo options — click to select source, auto-enables checkbox */}
                    <div className="flex gap-2">
                      {result.fpfPhotoUrl && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setPhotoSource('fpf'); setSelected((p) => ({ ...p, photo: true })); }}
                          className={`relative rounded-lg border-2 p-0.5 transition-all ${
                            selected.photo && photoSource === 'fpf' ? 'border-blue-500' : 'border-transparent opacity-60 hover:opacity-100'
                          }`}
                        >
                          <Image src={result.fpfPhotoUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-md object-cover" unoptimized />
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-white px-1 text-[9px] font-semibold text-muted-foreground shadow-sm">FPF</span>
                        </button>
                      )}
                      {result.zzPhotoUrl && zzEnabled && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setPhotoSource('zz'); setSelected((p) => ({ ...p, photo: true })); }}
                          className={`relative rounded-lg border-2 p-0.5 transition-all ${
                            selected.photo && photoSource === 'zz' ? 'border-blue-500' : 'border-transparent opacity-60 hover:opacity-100'
                          }`}
                        >
                          <Image src={result.zzPhotoUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-md object-cover" unoptimized />
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-white px-1 text-[9px] font-semibold text-muted-foreground shadow-sm">ZZ</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {result?.birthCountryChanged && result.birthCountry && (
              <ChangeRow
                checked={!!selected.birthCountry}
                onToggle={() => toggleField('birthCountry')}
                label="País Nascimento"
                oldValue={player.birthCountry || '—'}
                newValue={result.birthCountry}
              />
            )}
            {result?.nationalityChanged && result.nationality && (
              <ChangeRow
                checked={!!selected.nationality}
                onToggle={() => toggleField('nationality')}
                label="Nacionalidade"
                oldValue={player.nationality || '—'}
                newValue={result.nationality}
              />
            )}

            {/* ── ZeroZero link auto-found — user must confirm it's the right player ── */}
            {result?.zzLinkFound && (
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={!!selected.zzLink} onCheckedChange={toggleZzLink} className="mt-0.5" />
                <div className={`flex flex-col rounded-md border p-2 transition-colors ${
                  selected.zzLink
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-amber-200 bg-amber-50/50'
                }`}>
                  {/* Candidate info row: photo + name/club/link */}
                  <div className="flex gap-3">
                    {/* ZZ candidate photo */}
                    {result.zzPhotoUrl ? (
                      <Image src={result.zzPhotoUrl} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-lg object-cover" unoptimized />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                        <User className="h-5 w-5 text-neutral-300" />
                      </div>
                    )}
                    <div>
                      <p className={`text-xs font-medium ${selected.zzLink ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {selected.zzLink
                          ? 'Perfil ZeroZero confirmado'
                          : <>É este o perfil ZeroZero? <span className="font-normal text-amber-600">(pode não corresponder)</span></>
                        }
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {result.zzCandidateName || '—'}{result.zzCandidateAge ? `, ${result.zzCandidateAge} anos` : ''}{result.zzCandidateClub ? ` · ${result.zzCandidateClub}` : ''}
                      </p>
                      <a
                        href={result.zzLinkFound}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block text-xs font-medium text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Verificar perfil ↗
                      </a>
                    </div>
                  </div>
                </div>
              </label>
            )}

            {/* ── ZZ-sourced fields (visible when ZZ is confirmed or pre-existing) ── */}
            {zzEnabled && (
              <>
                {result?.heightChanged && result.height && (
                  <ChangeRow
                    checked={!!selected.height}
                    onToggle={() => toggleField('height')}
                    label="Altura"
                    oldValue={player.height ? `${player.height} cm` : '—'}
                    newValue={`${result.height} cm`}
                  />
                )}
                {result?.weightChanged && result.weight && (
                  <ChangeRow
                    checked={!!selected.weight}
                    onToggle={() => toggleField('weight')}
                    label="Peso"
                    oldValue={player.weight ? `${player.weight} kg` : '—'}
                    newValue={`${result.weight} kg`}
                  />
                )}
                {result?.positionChanged && (
                  <PositionChangeRow
                    checked={!!selected.position}
                    onToggle={() => toggleField('position')}
                    player={player}
                    result={result}
                    overrides={posOverrides}
                    onOverride={setPosOverrides}
                  />
                )}
                {result?.footChanged && result.foot && (
                  <ChangeRow
                    checked={!!selected.foot}
                    onToggle={() => toggleField('foot')}
                    label="Pé"
                    oldValue={player.foot || '—'}
                    newValue={result.foot}
                  />
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowDialog(false); setFeedback(null); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleApply} disabled={isApplying || !anySelected}>
              {isApplying ? 'A atualizar...' : 'Atualizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────── Helper ───────────── */

function ChangeRow({ checked, onToggle, label, oldValue, newValue, disabled, source }: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  oldValue: string;
  newValue: string;
  disabled?: boolean;
  source?: string;
}) {
  // Distinguish "adding new data" vs "updating existing data"
  const isNew = !oldValue || oldValue === '—';

  return (
    <label className={`flex items-start gap-2 cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" disabled={disabled} />
      <div>
        <p className="font-medium">
          {label}
          {source && <span className="ml-1 text-[10px] text-muted-foreground">({source})</span>}
        </p>
        {isNew ? (
          <p className="flex items-center gap-1.5">
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">Novo</span>
            <span className="font-medium">{newValue}</span>
          </p>
        ) : (
          <p>
            <span className="text-muted-foreground">{oldValue}</span>
            {' → '}
            <span className="font-medium">{newValue}</span>
          </p>
        )}
      </div>
    </label>
  );
}

/* ───────────── Position Change Row — with dropdowns for unknown positions ───────────── */

/** Dropdown for selecting a position code when ZZ returned an unknown position text */
function PositionSelect({ rawText, normalizedCode, value, onChange }: {
  rawText: string;
  normalizedCode: string | null;
  value: string;
  onChange: (code: string) => void;
}) {
  const isUnknown = !normalizedCode;
  if (!isUnknown) {
    // Known position — just show the code
    return <span className="font-medium">{normalizedCode}</span>;
  }
  // Unknown position — show raw text + dropdown
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-700">{rawText}</span>
      <span className="text-[10px] text-muted-foreground">→</span>
      <select
        className="rounded border border-amber-300 bg-white px-1 py-0.5 text-xs font-medium"
        value={value}
        onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
        onClick={(e) => e.stopPropagation()}
      >
        <option value="">Escolher...</option>
        {POSITIONS.map((p) => (
          <option key={p.code} value={p.code}>{p.code} — {p.labelPt}</option>
        ))}
      </select>
    </span>
  );
}

/** Position row: shows each position slot (primary/secondary/tertiary) with dropdowns for unknowns */
function PositionChangeRow({ checked, onToggle, player, result, overrides, onOverride }: {
  checked: boolean;
  onToggle: () => void;
  player: Player;
  result: ScrapedChanges;
  overrides: { primary?: string; secondary?: string; tertiary?: string };
  onOverride: (v: { primary?: string; secondary?: string; tertiary?: string }) => void;
}) {
  // Build position slots from ZZ data
  type PosKey = 'primary' | 'secondary' | 'tertiary';
  const allSlots: { key: PosKey; raw: string | null; normalized: string | null; current: string | null }[] = [
    { key: 'primary', raw: result.positionRaw, normalized: result.position, current: player.positionNormalized },
    { key: 'secondary', raw: result.secondaryPositionRaw, normalized: result.secondaryPosition, current: player.secondaryPosition },
    { key: 'tertiary', raw: result.tertiaryPositionRaw, normalized: result.tertiaryPosition, current: player.tertiaryPosition },
  ];
  const slots = allSlots.filter((s) => s.raw); // Only show slots that have ZZ data

  const currentPositions = [player.positionNormalized, player.secondaryPosition, player.tertiaryPosition].filter(Boolean).join(' / ') || '—';

  // NOT a <label> — dropdown clicks would toggle the checkbox
  return (
    <div className="flex items-start gap-2">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5 cursor-pointer" />
      <div>
        <p className="font-medium cursor-pointer" onClick={onToggle}>Posição</p>
        {currentPositions === '—'
          ? <p className="text-xs font-semibold text-green-600">Novo</p>
          : <p className="text-muted-foreground">{currentPositions} →</p>
        }
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {slots.map((slot, i) => (
            <span key={slot.key} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">/</span>}
              <PositionSelect
                rawText={slot.raw!}
                normalizedCode={slot.normalized}
                value={overrides[slot.key] || slot.normalized || ''}
                onChange={(code) => onOverride({ ...overrides, [slot.key]: code })}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
