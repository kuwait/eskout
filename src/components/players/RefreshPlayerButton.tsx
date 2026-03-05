// src/components/players/RefreshPlayerButton.tsx
// Single "Atualizar Atleta" button that scrapes FPF + ZeroZero, merges data, shows confirmation popup
// Replaces separate FpfRefreshButton and ZzRefreshButton with a unified flow
// RELEVANT FILES: src/actions/scraping.ts, src/components/players/PlayerProfile.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
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

  // Only show if the player has at least one external link
  if (!player.fpfLink && !player.zerozeroLink) return null;

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
        // Pre-select all changes
        const sel: Record<string, boolean> = {};
        if (res.clubChanged) sel.club = true;
        if (res.hasNewPhoto) sel.photo = true;
        if (res.heightChanged) sel.height = true;
        if (res.weightChanged) sel.weight = true;
        if (res.birthCountryChanged) sel.birthCountry = true;
        if (res.nationalityChanged) sel.nationality = true;
        if (res.positionChanged) sel.position = true;
        if (res.footChanged) sel.foot = true;
        setSelected(sel);
        setShowDialog(true);
      } else {
        setFeedback('Dados externos verificados — sem alterações');
      }
    });
  }

  function handleApply() {
    if (!result) return;
    startApply(async () => {
      const updates: Parameters<typeof applyScrapedData>[1] = {};
      if (selected.club && result.club) updates.club = result.club;
      if (selected.photo && result.photoUrl) updates.photoUrl = result.photoUrl;
      if (selected.height && result.height) updates.height = result.height;
      if (selected.weight && result.weight) updates.weight = result.weight;
      if (selected.birthCountry && result.birthCountry) updates.birthCountry = result.birthCountry;
      if (selected.nationality && result.nationality) updates.nationality = result.nationality;
      if (selected.position && result.position) updates.position = result.position;
      if (selected.foot && result.foot) updates.foot = result.foot;

      await applyScrapedData(player.id, updates);
      setShowDialog(false);
      setFeedback('Dados atualizados');
    });
  }

  function toggleField(field: string) {
    setSelected((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  const anySelected = Object.values(selected).some(Boolean);

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
        <RefreshCw className={`mr-1 h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'A verificar...' : 'Atualizar Atleta'}
      </Button>

      {feedback && <span className="text-xs text-muted-foreground">{feedback}</span>}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novos dados encontrados</DialogTitle>
            <DialogDescription>Seleciona os dados que queres atualizar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {result?.clubChanged && result.club && (
              <ChangeRow
                checked={!!selected.club}
                onToggle={() => toggleField('club')}
                label="Clube"
                oldValue={player.club || '—'}
                newValue={result.club}
              />
            )}
            {result?.hasNewPhoto && result.photoUrl && (
              <ChangeRow
                checked={!!selected.photo}
                onToggle={() => toggleField('photo')}
                label="Foto"
                oldValue="Sem foto"
                newValue="Disponível"
              />
            )}
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
            {result?.positionChanged && result.position && (
              <ChangeRow
                checked={!!selected.position}
                onToggle={() => toggleField('position')}
                label="Posição"
                oldValue={player.positionNormalized || '—'}
                newValue={`${result.position}${result.positionRaw ? ` (${result.positionRaw})` : ''}`}
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
            {/* Info-only fields (not editable, just informational) */}
            {result?.gamesSeason != null && (
              <p className="text-muted-foreground">Jogos (época): <span className="font-medium text-foreground">{result.gamesSeason}</span></p>
            )}
            {result?.goalsSeason != null && (
              <p className="text-muted-foreground">Golos (época): <span className="font-medium text-foreground">{result.goalsSeason}</span></p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowDialog(false); setFeedback('Não atualizado'); }}>
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

function ChangeRow({ checked, onToggle, label, oldValue, newValue }: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  oldValue: string;
  newValue: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <div>
        <p className="font-medium">{label}</p>
        <p>
          <span className="text-muted-foreground">{oldValue}</span>
          {' → '}
          <span className="font-medium">{newValue}</span>
        </p>
      </div>
    </label>
  );
}
