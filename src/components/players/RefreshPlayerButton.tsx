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
import { scrapePlayerAll, applyScrapedData, type ScrapedChanges } from '@/actions/scraping';
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

  // Only show if the player has at least one external link
  if (!player.fpfLink && !player.zerozeroLink) return null;

  // Whether ZZ data is trusted (either pre-existing link or user selected the auto-found link)
  const zzEnabled = result?.zzConfirmed || !!selected.zzLink;

  function handleRefresh() {
    setFeedback(null);
    startTransition(async () => {
      const res = await scrapePlayerAll(player.id);
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
        // Default photo source: FPF if available (most reliable), ZZ only if confirmed
        setPhotoSource(res.fpfPhotoUrl ? 'fpf' : res.zzPhotoUrl && res.zzConfirmed ? 'zz' : null);
        setShowDialog(true);
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
        if (selected.position && result.position) updates.position = result.position;
        if (selected.foot && result.foot) updates.foot = result.foot;
      }
      // Only apply ZZ link if user explicitly confirmed it
      if (selected.zzLink && result.zzLinkFound) updates.zzLinkFound = result.zzLinkFound;

      await applyScrapedData(player.id, updates);
      setShowDialog(false);
      setFeedback('Dados atualizados');
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
    <>
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending || feedback === 'ok'}>
        {feedback === 'ok' ? (
          <Check className="mr-1 h-3 w-3 text-emerald-500" />
        ) : (
          <RefreshCw className={`mr-1 h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
        )}
        {isPending ? 'A verificar...' : feedback === 'ok' ? 'Sem alterações' : 'Atualizar'}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novos dados encontrados</DialogTitle>
            <DialogDescription>Seleciona os dados que queres atualizar.</DialogDescription>
          </DialogHeader>
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
                  {/* ZZ-sourced fields — below candidate info, visible when confirmed */}
                  {zzEnabled && (
                    <div className="mt-2 space-y-2 border-t border-emerald-200 pt-2">
                      {result.heightChanged && result.height && (
                        <ChangeRow
                          checked={!!selected.height}
                          onToggle={() => toggleField('height')}
                          label="Altura"
                          oldValue={player.height ? `${player.height} cm` : '—'}
                          newValue={`${result.height} cm`}
                        />
                      )}
                      {result.weightChanged && result.weight && (
                        <ChangeRow
                          checked={!!selected.weight}
                          onToggle={() => toggleField('weight')}
                          label="Peso"
                          oldValue={player.weight ? `${player.weight} kg` : '—'}
                          newValue={`${result.weight} kg`}
                        />
                      )}
                      {result.positionChanged && result.position && (
                        <ChangeRow
                          checked={!!selected.position}
                          onToggle={() => toggleField('position')}
                          label="Posição"
                          oldValue={player.positionNormalized || '—'}
                          newValue={`${result.position}${result.positionRaw ? ` (${result.positionRaw})` : ''}`}
                        />
                      )}
                      {result.footChanged && result.foot && (
                        <ChangeRow
                          checked={!!selected.foot}
                          onToggle={() => toggleField('foot')}
                          label="Pé"
                          oldValue={player.foot || '—'}
                          newValue={result.foot}
                        />
                      )}
                    </div>
                  )}
                </div>
              </label>
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
    </>
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
