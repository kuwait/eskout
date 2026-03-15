// src/components/pipeline/StatusChangeDialog.tsx
// Confirmation dialog shown when moving a player to "Em Contacto" status
// Requires selecting a contact purpose and responsible person before confirming
// RELEVANT FILES: src/actions/pipeline.ts, src/components/pipeline/PipelineView.tsx, src/lib/types/index.ts

'use client';

import { useState } from 'react';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContactPurpose } from '@/lib/types';

/* ───────────── Constants ───────────── */

/** Hardcoded "Outro" option — always last, not in DB */
const OUTRO_VALUE = '__outro__';
const CUSTOM_MAX_LENGTH = 50;

/* ───────────── Props ───────────── */

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Player name for display */
  playerName: string;
  /** Available contact purpose options for this club */
  contactPurposes: ContactPurpose[];
  /** Club members for responsible person assignment */
  clubMembers: { id: string; fullName: string }[];
  /** Currently assigned person (pre-select if already set) */
  currentAssignedTo?: string | null;
  /** Callback when user confirms — receives purpose + responsible person data */
  onConfirm: (purposeId: string | null, purposeCustom: string | null, note: string | null, assignedTo: string | null) => void;
}

/* ───────────── Component ───────────── */

export function StatusChangeDialog({
  open,
  onOpenChange,
  playerName,
  contactPurposes,
  clubMembers = [],
  currentAssignedTo,
  onConfirm,
}: StatusChangeDialogProps) {
  const [selectedPurpose, setSelectedPurpose] = useState<string>('');
  const [customText, setCustomText] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>(currentAssignedTo ?? '');

  const isOutro = selectedPurpose === OUTRO_VALUE;
  const hasValidPurpose = selectedPurpose && (!isOutro || customText.trim().length > 0);

  function handleConfirm() {
    if (!hasValidPurpose) return;

    const purposeId = isOutro ? null : selectedPurpose;
    const purposeCustom = isOutro ? customText.trim() : null;
    const assignedValue = assignedTo || null;

    onConfirm(purposeId, purposeCustom, null, assignedValue);
    resetAndClose();
  }

  function handleCancel() {
    toast.info('Mudança cancelada — jogador mantém-se no estado atual');
    resetAndClose();
  }

  function resetAndClose() {
    setSelectedPurpose('');
    setCustomText('');
    setAssignedTo(currentAssignedTo ?? '');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-500" />
            Mover para Em Contacto
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{playerName}</span>
        </p>

        {/* Responsible person selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Responsável pelo contacto</Label>
          <Select value={assignedTo || 'none'} onValueChange={(v) => setAssignedTo(v === 'none' ? '' : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecionar responsável…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem responsável</SelectItem>
              {clubMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Contact Purpose selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Objetivo do Contacto *</Label>
          <Select value={selectedPurpose} onValueChange={setSelectedPurpose}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecionar objetivo…" />
            </SelectTrigger>
            <SelectContent>
              {contactPurposes.map((cp) => (
                <SelectItem key={cp.id} value={cp.id}>
                  {cp.label}
                </SelectItem>
              ))}
              <SelectItem value={OUTRO_VALUE}>Outro…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom text field — shown only when "Outro" is selected */}
        {isOutro && (
          <div className="space-y-1.5">
            <Label className="text-xs">Especificar objetivo *</Label>
            <Textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value.slice(0, CUSTOM_MAX_LENGTH))}
              placeholder="Descrever o objetivo…"
              className="h-16 resize-none text-sm"
              maxLength={CUSTOM_MAX_LENGTH}
              autoFocus
            />
            <p className="text-right text-[10px] text-muted-foreground">
              {customText.length}/{CUSTOM_MAX_LENGTH}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!hasValidPurpose}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
