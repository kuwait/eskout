// src/app/admin/pendentes/PendentesClient.tsx
// Client component for "Jogadores Adicionados" — per-user notification list
// Shows players added by others; scout-created need approval, others just dismiss
// RELEVANT FILES: src/app/admin/pendentes/page.tsx, src/actions/players.ts

'use client';

import { useState, useEffect } from 'react';
import { Check, Eye, X, UserPlus, History } from 'lucide-react';
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

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  scout: 'bg-amber-100 text-amber-700',
  recruiter: 'bg-green-100 text-green-700',
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
  allPlayers,
}: {
  /** Scout-created, not yet approved globally */
  pendingPlayers: AddedPlayer[];
  /** Already approved or auto-approved (non-scout) — just needs dismiss */
  approvedPlayers: AddedPlayer[];
  /** Full history of all players added by others (including dismissed) */
  allPlayers: AddedPlayer[];
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState<number | null>(null);
  const [dismissingAll, setDismissingAll] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-neutral-300 hover:text-neutral-600"
          >
            <History className="h-3.5 w-3.5" />
            Histórico ({allPlayers.length})
          </button>
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
      </div>

      {/* ───────────── Notification View (always visible) ───────────── */}
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

      {/* ───────────── History Side Panel ───────────── */}
      {panelOpen && (
        <AllPlayersPanel
          players={allPlayers}
          formatDate={formatDate}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

/* ───────────── All Players Side Panel ───────────── */

const PANEL_PAGE_SIZE = 25;

function AllPlayersPanel({
  players,
  formatDate,
  onClose,
}: {
  players: AddedPlayer[];
  formatDate: (iso: string) => string;
  onClose: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PANEL_PAGE_SIZE);
  const hasMore = visibleCount < players.length;
  const visible = players.slice(0, visibleCount);

  // Group by date
  const grouped = new Map<string, AddedPlayer[]>();
  for (const p of visible) {
    const dateKey = formatDate(p.createdAt);
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(p);
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Histórico</h2>
            <p className="text-xs text-muted-foreground">{players.length} jogadores adicionados</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent shrink-0"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {players.length === 0 ? (
            <div className="text-center py-12">
              <UserPlus className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum jogador adicionado por outros</p>
            </div>
          ) : (
            <div className="space-y-5">
              {[...grouped.entries()].map(([dateLabel, dayPlayers]) => (
                <div key={dateLabel}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{dateLabel}</p>
                  <div className="rounded-lg overflow-hidden">
                    {dayPlayers.map((p, idx) => (
                      <Link
                        key={p.id}
                        href={`/jogadores/${p.id}`}
                        className={`flex items-center gap-3 px-3 py-2 transition-colors hover:bg-neutral-100 ${idx % 2 === 0 ? 'bg-neutral-50' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            {p.position && (
                              <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{p.position}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate" suppressHydrationWarning>
                            {p.club} · por {p.createdBy} às {new Date(p.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${ROLE_COLORS[p.createdByRole] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          {ROLE_LABELS[p.createdByRole]?.[0] ?? '?'}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {/* Load more */}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + PANEL_PAGE_SIZE)}
                  className="flex w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-700"
                >
                  Carregar mais ({players.length - visibleCount} restantes)
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
