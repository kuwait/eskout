// src/components/players/ManualReportForm.tsx
// Manual scouting report form — same data as PDF reports but entered by hand
// Opened from the player profile Observação section
// RELEVANT FILES: src/actions/scout-reports.ts, src/components/players/ScoutingReports.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { HalfStarRating, getStarColor } from '@/components/players/QuickReportForm';

/* ───────────── Types ───────────── */

interface ManualReportFormProps {
  playerId: number;
  playerName: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

interface FormState {
  competition: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  resultHome: string;
  resultAway: string;
  physicalProfile: string;
  strengths: string;
  weaknesses: string;
  rating: number;
  decision: string;
  analysis: string;
  contactInfo: string;
}

const EMPTY_STATE: FormState = {
  competition: '',
  homeTeam: '',
  awayTeam: '',
  matchDate: '',
  resultHome: '',
  resultAway: '',
  physicalProfile: '',
  strengths: '',
  weaknesses: '',
  rating: 0,
  decision: '',
  analysis: '',
  contactInfo: '',
};

const DECISIONS = [
  { value: 'Assinar', label: 'Assinar', color: 'bg-green-500 text-white' },
  { value: 'Acompanhar', label: 'Acompanhar', color: 'bg-yellow-500 text-white' },
  { value: 'Sem interesse', label: 'Sem interesse', color: 'bg-red-500 text-white' },
];

/* ───────────── Helpers ───────────── */

function isDirty(form: FormState): boolean {
  return form.competition !== '' || form.homeTeam !== '' || form.awayTeam !== ''
    || form.matchDate !== '' || form.physicalProfile !== '' || form.strengths !== ''
    || form.weaknesses !== '' || form.rating > 0 || form.decision !== ''
    || form.analysis !== '' || form.contactInfo !== '';
}

/* ───────────── Component ───────────── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- playerName kept for future use (e.g. form title)
export function ManualReportForm({ playerId, playerName, onSuccess, onCancel, onDirtyChange }: ManualReportFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_STATE);
  const [isPending, startTransition] = useTransition();
  const prevDirty = useRef(false);

  // Notify parent when dirty state changes
  useEffect(() => {
    const dirty = isDirty(form);
    if (dirty !== prevDirty.current) {
      prevDirty.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [form, onDirtyChange]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const canSubmit = form.rating > 0 && form.decision !== '';

  function handleSubmit() {
    if (!canSubmit) {
      toast.error('Avaliação e decisão são obrigatórias');
      return;
    }

    startTransition(async () => {
      const { submitManualReport } = await import('@/actions/scout-reports');
      const match = form.homeTeam && form.awayTeam
        ? `${form.homeTeam} vs ${form.awayTeam}`
        : form.homeTeam || form.awayTeam || '';
      const matchResult = form.resultHome && form.resultAway
        ? `${form.resultHome}-${form.resultAway}`
        : '';

      const result = await submitManualReport({
        playerId,
        competition: form.competition || undefined,
        match: match || undefined,
        matchDate: form.matchDate || undefined,
        matchResult: matchResult || undefined,
        physicalProfile: form.physicalProfile || undefined,
        strengths: form.strengths || undefined,
        weaknesses: form.weaknesses || undefined,
        rating: form.rating,
        decision: form.decision,
        analysis: form.analysis || undefined,
        contactInfo: form.contactInfo || undefined,
      });

      if (result.success) {
        toast.success('Relatório submetido');
        onSuccess?.();
      } else {
        toast.error(result.error ?? 'Erro ao submeter');
      }
    });
  }

  return (
    <div className="space-y-4 overflow-hidden px-1">
      {/* Match context */}
      <div className="rounded-lg border bg-white px-4 py-3.5 space-y-3">
        <span className="text-sm font-semibold">Contexto do Jogo</span>

        <div>
          <label className="text-xs text-muted-foreground">Competição</label>
          <Input
            value={form.competition}
            onChange={e => update('competition', e.target.value)}
            placeholder="Ex: Campeonato Nacional Sub-14"
            className="mt-1 h-10 placeholder:text-xs placeholder:text-muted-foreground/40"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Jogo</label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={form.homeTeam}
              onChange={e => update('homeTeam', e.target.value)}
              placeholder="Equipa casa"
              className="h-10 placeholder:text-xs placeholder:text-muted-foreground/40"
            />
            <span className="text-xs font-medium text-muted-foreground shrink-0">vs</span>
            <Input
              value={form.awayTeam}
              onChange={e => update('awayTeam', e.target.value)}
              placeholder="Equipa fora"
              className="h-10 placeholder:text-xs placeholder:text-muted-foreground/40"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Data do jogo</label>
            <Input
              type="date"
              value={form.matchDate}
              onChange={e => update('matchDate', e.target.value)}
              className={`mt-1 h-10 ${!form.matchDate ? 'text-muted-foreground/40 text-xs' : ''}`}
            />
          </div>
          <div className="w-28">
            <label className="text-xs text-muted-foreground">Resultado</label>
            <div className="mt-1 flex items-center gap-1">
              <Input
                value={form.resultHome}
                onChange={e => update('resultHome', e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="h-10 text-center placeholder:text-muted-foreground/40"
                maxLength={2}
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                value={form.resultAway}
                onChange={e => update('resultAway', e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="h-10 text-center placeholder:text-muted-foreground/40"
                maxLength={2}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Evaluation */}
      <div className="rounded-lg border bg-white px-4 py-3.5 space-y-3">
        <span className="text-sm font-semibold">Avaliação</span>

        <div>
          <label className="text-xs text-muted-foreground">Perfil físico</label>
          <Textarea
            value={form.physicalProfile}
            onChange={e => update('physicalProfile', e.target.value)}
            placeholder="Descrição do perfil físico do jogador..."
            className="mt-1 resize-none placeholder:text-xs placeholder:text-muted-foreground/40"
            rows={3}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Pontos fortes</label>
          <Textarea
            value={form.strengths}
            onChange={e => update('strengths', e.target.value)}
            placeholder="Principais qualidades observadas..."
            className="mt-1 resize-none placeholder:text-xs placeholder:text-muted-foreground/40"
            rows={3}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Pontos fracos</label>
          <Textarea
            value={form.weaknesses}
            onChange={e => update('weaknesses', e.target.value)}
            placeholder="Aspetos a melhorar..."
            className="mt-1 resize-none placeholder:text-xs placeholder:text-muted-foreground/40"
            rows={3}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Análise geral</label>
          <Textarea
            value={form.analysis}
            onChange={e => update('analysis', e.target.value)}
            placeholder="Resumo da observação..."
            className="mt-1 resize-none placeholder:text-xs placeholder:text-muted-foreground/40"
            rows={2}
          />
        </div>

        {/* Rating — half-star with unified color scale */}
        <div>
          <label className="text-xs text-muted-foreground">
            Avaliação <span className="text-red-500">*</span>
            {form.rating > 0 && (
              <span className={`ml-2 text-sm font-black ${getStarColor(form.rating)}`}>
                {Number.isInteger(form.rating) ? form.rating : form.rating.toFixed(1)}
              </span>
            )}
          </label>
          <HalfStarRating value={form.rating} onChange={v => update('rating', v)} />
        </div>

        {/* Decision — pill buttons like QuickReportForm */}
        <div>
          <label className="text-xs text-muted-foreground">
            Decisão <span className="text-red-500">*</span>
          </label>
          <div className="mt-1.5 flex gap-2">
            {DECISIONS.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => update('decision', form.decision === d.value ? '' : d.value)}
                className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all ${
                  form.decision === d.value
                    ? d.color + ' ring-2 ring-offset-1 ring-neutral-900'
                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div>
          <label className="text-xs text-muted-foreground">Contacto</label>
          <Input
            value={form.contactInfo}
            onChange={e => update('contactInfo', e.target.value)}
            placeholder="Nº de telefone"
            className="mt-1 h-10 placeholder:text-xs placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pb-[env(safe-area-inset-bottom)] pt-4">
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} className="flex-1 h-12 rounded-xl">
              Cancelar
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="flex-1 h-12 rounded-xl text-base"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Send className="mr-2 h-5 w-5" />
            )}
            Submeter relatório
          </Button>
        </div>
      </div>
    </div>
  );
}
