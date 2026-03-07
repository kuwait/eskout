// src/app/admin/relatorios/[id]/AdminReportActions.tsx
// Client component with approve/reject buttons for admin scout report review
// Approve creates player (or links existing); reject marks as rejected
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/admin/relatorios/[id]/page.tsx

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { approveScoutReport, rejectScoutReport } from '@/actions/scout-reports';

interface Props {
  reportId: number;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  linkedPlayerId: number | null;
}

export function AdminReportActions({ reportId, status, linkedPlayerId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Already processed — show result
  if (status === 'aprovado') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
        <p className="font-medium text-emerald-700">Relatório aprovado</p>
        {linkedPlayerId && (
          <Link
            href={`/jogadores/${linkedPlayerId}`}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
          >
            Ver jogador <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    );
  }

  if (status === 'rejeitado') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
        <p className="font-medium text-red-700">Relatório rejeitado</p>
      </div>
    );
  }

  function handleApprove() {
    startTransition(async () => {
      const result = await approveScoutReport(reportId);
      if (result.success) {
        setFeedback({ type: 'success', message: `Jogador criado com sucesso!` });
        // Redirect to the player profile after a short delay
        if (result.playerId) {
          setTimeout(() => router.push(`/jogadores/${result.playerId}`), 1500);
        } else {
          router.refresh();
        }
      } else {
        setFeedback({ type: 'error', message: result.error ?? 'Erro ao aprovar' });
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectScoutReport(reportId);
      if (result.success) {
        setFeedback({ type: 'success', message: 'Relatório rejeitado' });
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: result.error ?? 'Erro ao rejeitar' });
      }
    });
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <div className={`rounded-md border px-4 py-2 text-sm ${
          feedback.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          size="lg"
          onClick={handleApprove}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Aprovar e criar jogador
        </Button>
        <Button
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          size="lg"
          onClick={handleReject}
          disabled={isPending}
        >
          <X className="mr-2 h-4 w-4" />
          Rejeitar
        </Button>
      </div>
    </div>
  );
}
