// src/app/admin/pendentes/PendentesClient.tsx
// Client component for "Jogadores Adicionados" — per-user notification list
// Shows players added by others; scout-created need approval, others just dismiss
// RELEVANT FILES: src/app/admin/pendentes/page.tsx, src/actions/players.ts

'use client';

import { useState } from 'react';
import { Check, Eye, X, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { approvePlayer, rejectPlayer, dismissPlayerReview, dismissAllPlayerReviews } from '@/actions/players';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import Link from 'next/link';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  scout: 'Scout',
  recruiter: 'Recrutador',
};

interface AddedPlayer {
  id: number;
  name: string;
  dob: string;
  club: string;
  position: string | null;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
  /** Only for scout-created: name of the user who approved, null if not yet approved */
  approvedByName: string | null;
}

export function PendentesClient({
  pendingPlayers,
  approvedPlayers,
}: {
  /** Scout-created, not yet approved globally */
  pendingPlayers: AddedPlayer[];
  /** Already approved or auto-approved (non-scout) — just needs dismiss */
  approvedPlayers: AddedPlayer[];
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState<number | null>(null);
  const [dismissingAll, setDismissingAll] = useState(false);

  /* ───────────── Realtime: refresh when players change ───────────── */
  useRealtimeTable('players', { onAny: () => router.refresh() });

  async function handleApprove(id: number) {
    setProcessing(id);
    const result = await approvePlayer(id);
    setProcessing(null);
    if (result.success) {
      toast.success('Jogador aprovado');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleReject(id: number) {
    if (!confirm('Rejeitar e eliminar este jogador?')) return;
    setProcessing(id);
    const result = await rejectPlayer(id);
    setProcessing(null);
    if (result.success) {
      toast.success('Jogador rejeitado');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleDismiss(id: number) {
    setProcessing(id);
    const result = await dismissPlayerReview(id);
    setProcessing(null);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleDismissAll() {
    setDismissingAll(true);
    const result = await dismissAllPlayerReviews();
    setDismissingAll(false);
    if (result.success) {
      toast.success('Todas as notificações dispensadas');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  const totalCount = pendingPlayers.length + approvedPlayers.length;

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold lg:text-2xl">Jogadores Adicionados</h1>
        {totalCount > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismissAll}
            disabled={dismissingAll}
            className="text-xs text-muted-foreground"
          >
            Limpar tudo
          </Button>
        )}
      </div>

      {totalCount === 0 && (
        <div className="rounded-lg border bg-white p-8 text-center">
          <UserPlus className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum jogador por rever</p>
        </div>
      )}

      {/* ───────────── Pending Approval (Scout-created) ───────────── */}
      {pendingPlayers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3">
            Aguardar Aprovação ({pendingPlayers.length})
          </h2>
          <div className="space-y-2">
            {pendingPlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-white p-3 hover:bg-neutral-50 transition-colors">
                <Link href={`/jogadores/${p.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.approvedByName ? (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        Aceite por {p.approvedByName}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        Pendente
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.club} {p.position && `· ${p.position}`} · {formatDate(p.dob)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submetido por <span className="font-medium">{p.createdBy}</span> ({ROLE_LABELS[p.createdByRole] ?? p.createdByRole}) · {formatDate(p.createdAt)}
                  </p>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  {!p.approvedByName ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => handleApprove(p.id)}
                        disabled={processing === p.id}
                        title="Aprovar"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleReject(p.id)}
                        disabled={processing === p.id}
                        title="Rejeitar"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleDismiss(p.id)}
                      disabled={processing === p.id}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-medium text-neutral-500 transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:opacity-50"
                    >
                      <Eye className="h-3 w-3" />
                      Visto
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───────────── Already Approved / Auto-Approved ───────────── */}
      {approvedPlayers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3">
            Adicionados Recentemente ({approvedPlayers.length})
          </h2>
          <div className="space-y-2">
            {approvedPlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-white p-3 hover:bg-neutral-50 transition-colors">
                <Link href={`/jogadores/${p.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      {ROLE_LABELS[p.createdByRole] ?? p.createdByRole}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.club} {p.position && `· ${p.position}`} · {formatDate(p.dob)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Adicionado por <span className="font-medium">{p.createdBy}</span> · {formatDate(p.createdAt)}
                  </p>
                </Link>
                <button
                  onClick={() => handleDismiss(p.id)}
                  disabled={processing === p.id}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-medium text-neutral-500 transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:opacity-50"
                >
                  <Eye className="h-3 w-3" />
                  Visto
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
