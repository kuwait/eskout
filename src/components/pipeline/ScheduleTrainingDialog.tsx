// src/components/pipeline/ScheduleTrainingDialog.tsx
// Dialog obrigatório quando player é movido para vir_treinar no pipeline
// Força agendar pelo menos 1 treino — chama scheduleTraining que auto-move o player
// RELEVANT FILES: src/actions/training-feedback.ts, src/components/pipeline/PipelineView.tsx, src/components/players/TrainingSessionsList.tsx

'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Calendar, GraduationCap, Loader2, MapPin, Plus, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { scheduleTraining } from '@/actions/training-feedback';

/* ───────────── Props ───────────── */

interface ScheduleTrainingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: number | null;
  playerName: string;
  defaultEscalao?: string | null;
  /** Chamado após agendar com sucesso pelo menos 1 treino */
  onScheduled: () => void;
  /** Chamado se o user cancelar — reverte a mudança de estado pendente */
  onCancel: () => void;
}

type DateSlot = { date: string; time: string };

/* ───────────── Component ───────────── */

export function ScheduleTrainingDialog({
  open, onOpenChange, playerId, playerName, defaultEscalao, onScheduled, onCancel,
}: ScheduleTrainingDialogProps) {
  const today = new Date().toISOString().split('T')[0];
  const [slots, setSlots] = useState<DateSlot[]>([{ date: today, time: '10:00' }]);
  const [location, setLocation] = useState('');
  const [escalao, setEscalao] = useState(defaultEscalao ?? '');
  const [isPending, startTransition] = useTransition();

  function updateSlot(i: number, patch: Partial<DateSlot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    const last = slots[slots.length - 1];
    const next = new Date(last.date + 'T12:00:00');
    next.setDate(next.getDate() + 1);
    setSlots((prev) => [...prev, { date: next.toISOString().slice(0, 10), time: last.time }]);
  }

  function removeSlot(i: number) {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleClose() {
    // Reset state + cancel status move
    setSlots([{ date: today, time: '10:00' }]);
    setLocation('');
    setEscalao(defaultEscalao ?? '');
    onCancel();
    onOpenChange(false);
  }

  function handleSubmit() {
    if (!playerId) return;
    const validSlots = slots.filter((s) => s.date);
    if (validSlots.length === 0) {
      toast.error('Adiciona pelo menos uma data');
      return;
    }
    startTransition(async () => {
      let ok = 0;
      for (const slot of validSlots) {
        const res = await scheduleTraining({
          playerId,
          trainingDate: slot.date,
          sessionTime: slot.time || undefined,
          location: location || undefined,
          escalao: escalao || undefined,
        });
        if (res.success) ok++;
        else toast.error(`Erro em ${slot.date}: ${res.error}`);
      }
      if (ok > 0) {
        toast.success(ok === 1 ? 'Treino agendado' : `${ok} treinos agendados`);
        // Reset + propaga sucesso (pipeline já foi auto-movido pela action)
        setSlots([{ date: today, time: '10:00' }]);
        setLocation('');
        setEscalao(defaultEscalao ?? '');
        onScheduled();
        onOpenChange(false);
      }
    });
  }

  const validCount = slots.filter((s) => s.date).length;
  const ctaLabel = validCount === 1 ? 'Agendar treino' : `Agendar ${validCount} treinos`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar treino — {playerName}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Para mover o jogador para &ldquo;Vir Treinar&rdquo; tens de agendar pelo menos um treino.
        </p>

        <div className="space-y-5 pt-2">
          {/* Datas */}
          <div>
            <p className="mb-2 text-sm font-semibold text-neutral-800">Quando?</p>
            <div className="space-y-2">
              {slots.map((slot, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2">
                    <Calendar className="h-4 w-4 shrink-0 text-neutral-400" />
                    <input type="date" value={slot.date}
                      onChange={(e) => updateSlot(i, { date: e.target.value })}
                      className="flex-1 bg-transparent text-sm outline-none" />
                    <span className="text-neutral-300">·</span>
                    <input type="time" value={slot.time}
                      onChange={(e) => updateSlot(i, { time: e.target.value })}
                      className="w-20 bg-transparent text-sm outline-none" />
                  </div>
                  {slots.length > 1 && (
                    <button type="button" onClick={() => removeSlot(i)}
                      className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600 transition">
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addSlot}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:bg-neutral-50">
              <Plus className="h-3.5 w-3.5" />
              Adicionar outra data
            </button>
          </div>

          {/* Detalhes */}
          <div>
            <p className="mb-2 text-sm font-semibold text-neutral-800">Detalhes</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <GraduationCap className="h-4 w-4 shrink-0 text-neutral-400" />
                <input type="text" value={escalao} onChange={(e) => setEscalao(e.target.value)}
                  placeholder="Escalão"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <MapPin className="h-4 w-4 shrink-0 text-neutral-400" />
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="Local (opcional)"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={handleClose} disabled={isPending}
              className="rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50">
              Cancelar
            </button>
            <button type="button" onClick={handleSubmit} disabled={isPending || validCount === 0}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500">
              {isPending ? <><Loader2 className="h-4 w-4 shrink-0 animate-spin" /> A agendar...</> : <span className="truncate">{ctaLabel}</span>}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
