// src/app/definicoes/DefinicoesClient.tsx
// Client component for club settings — club identity editing + bulk data sync
// Separated from page.tsx so the server component can pass club data
// RELEVANT FILES: src/app/definicoes/page.tsx, src/actions/clubs.ts, src/actions/scraping.ts

'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Database, CheckCircle, AlertTriangle, Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { bulkScrapeExternalData, type BulkUpdateProgress } from '@/actions/scraping';
import { updateMyClubDetails } from '@/actions/clubs';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const BATCH_SIZE = 10;

export function DefinicoesClient({
  clubName: initialName,
  clubLogoUrl: initialLogoUrl,
}: {
  clubName: string;
  clubLogoUrl: string | null;
}) {
  const router = useRouter();

  // Club identity
  const [clubName, setClubName] = useState(initialName);
  const [clubLogoUrl, setClubLogoUrl] = useState(initialLogoUrl ?? '');
  const [savingClub, setSavingClub] = useState(false);

  // Bulk update
  const [isRunning, setIsRunning] = useState(false);
  const [sources, setSources] = useState<('fpf' | 'zerozero')[]>(['fpf', 'zerozero']);
  const [progress, setProgress] = useState<BulkUpdateProgress | null>(null);
  const [finished, setFinished] = useState(false);

  async function handleSaveClub() {
    const trimmedName = clubName.trim();
    if (!trimmedName) {
      toast.error('O nome do clube não pode estar vazio');
      return;
    }
    setSavingClub(true);
    const result = await updateMyClubDetails({
      name: trimmedName,
      logoUrl: clubLogoUrl.trim() || undefined,
    });
    setSavingClub(false);
    if (result.success) {
      toast.success('Dados do clube atualizados');
      router.refresh();
    } else {
      toast.error(result.error ?? 'Erro ao guardar');
    }
  }

  const runBulkUpdate = useCallback(async () => {
    setIsRunning(true);
    setFinished(false);
    setProgress({ total: 0, processed: 0, fpfUpdated: 0, zzUpdated: 0, errors: 0 });

    let offset = 0;
    let totalFpf = 0;
    let totalZz = 0;
    let totalErrors = 0;
    let totalCount = 0;

    // Process in batches
    let hasMore = true;
    while (hasMore) {
      try {
        const result = await bulkScrapeExternalData(offset, BATCH_SIZE, sources);
        totalFpf += result.fpfUpdated;
        totalZz += result.zzUpdated;
        totalErrors += result.errors;
        totalCount = result.total;
        offset = result.processed;
        hasMore = result.hasMore;

        setProgress({
          total: totalCount,
          processed: offset,
          fpfUpdated: totalFpf,
          zzUpdated: totalZz,
          errors: totalErrors,
        });
      } catch {
        totalErrors++;
        hasMore = false;
      }
    }

    setIsRunning(false);
    setFinished(true);
  }, [sources]);

  function toggleSource(source: 'fpf' | 'zerozero') {
    setSources((prev) => {
      if (prev.includes(source)) {
        const next = prev.filter((s) => s !== source);
        return next.length === 0 ? prev : next;
      }
      return [...prev, source];
    });
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Clube</h1>

      <div className="mx-auto max-w-2xl space-y-4">
        {/* ───────────── Club Identity ───────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Dados do Clube
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="club-name">Nome</label>
              <input
                id="club-name"
                type="text"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
                placeholder="Nome do clube"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="club-logo">Logo (URL)</label>
              <input
                id="club-logo"
                type="url"
                value={clubLogoUrl}
                onChange={(e) => setClubLogoUrl(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
                placeholder="https://exemplo.com/logo.png"
              />
              <p className="mt-1 text-xs text-muted-foreground">URL da imagem do logo (PNG, SVG, etc.)</p>
            </div>
            <Button size="sm" onClick={handleSaveClub} disabled={savingClub}>
              {savingClub && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </CardContent>
        </Card>

        {/* ───────────── Bulk External Data Update ───────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              Atualizar dados externos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Percorre todos os jogadores com links FPF e/ou ZeroZero e atualiza fotos, clube atual, estatísticas e histórico.
            </p>

            {/* Source selection */}
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sources.includes('fpf')}
                  onChange={() => toggleSource('fpf')}
                  disabled={isRunning}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                FPF (clube atual, foto)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sources.includes('zerozero')}
                  onChange={() => toggleSource('zerozero')}
                  disabled={isRunning}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                ZeroZero (stats, foto, histórico)
              </label>
            </div>

            {/* Progress bar */}
            {progress && (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-neutral-900 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress.processed} / {progress.total} jogadores</span>
                  <span>{pct}%</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {progress.fpfUpdated > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-3 w-3" /> {progress.fpfUpdated} FPF
                    </span>
                  )}
                  {progress.zzUpdated > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-3 w-3" /> {progress.zzUpdated} ZeroZero
                    </span>
                  )}
                  {progress.errors > 0 && (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertTriangle className="h-3 w-3" /> {progress.errors} erros
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Finished message */}
            {finished && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-medium text-green-800">
                  Atualização concluída
                </p>
                <p className="text-xs text-green-700">
                  FPF: {progress?.fpfUpdated ?? 0} atualizados | ZeroZero: {progress?.zzUpdated ?? 0} atualizados | Erros: {progress?.errors ?? 0}
                </p>
              </div>
            )}

            <Button onClick={runBulkUpdate} disabled={isRunning}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? 'A atualizar...' : 'Atualizar base de dados'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
