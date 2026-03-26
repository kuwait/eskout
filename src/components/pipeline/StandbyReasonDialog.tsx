// src/components/pipeline/StandbyReasonDialog.tsx
// Dialog shown when moving a player to "Em Stand-by" — requires mandatory reason text
// Explains why the player is on hold (e.g. waiting for spot, medical, etc.)
// RELEVANT FILES: src/components/pipeline/PipelineView.tsx, src/actions/pipeline.ts, src/lib/constants.ts

'use client';

import { useState } from 'react';
import { Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/* ───────────── Types ───────────── */

interface StandbyReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  onConfirm: (reason: string) => void;
}

/* ───────────── Component ───────────── */

export function StandbyReasonDialog({ open, onOpenChange, playerName, onConfirm }: StandbyReasonDialogProps) {
  const [reason, setReason] = useState('');

  function handleConfirm() {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
    onOpenChange(false);
  }

  function handleCancel() {
    setReason('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); else onOpenChange(true); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Pause className="h-4 w-4 text-slate-500" />
            Em Stand-by
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {playerName} — motivo obrigatório
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="standby-reason" className="text-xs">Motivo</Label>
          <Textarea
            id="standby-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: À espera de vaga no plantel, situação médica..."
            rows={3}
            className="resize-none text-sm"
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!reason.trim()} onClick={handleConfirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
