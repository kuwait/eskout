// src/app/master/competicoes/CompetitionsClient.tsx
// Client component for browsing, adding, and scraping FPF competitions
// Combines competition browser, tracked list, and scraping progress into one view
// RELEVANT FILES: src/actions/scraping/fpf-competitions/browse.ts, src/actions/scraping/fpf-competitions/scrape-competition.ts

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus, Loader2, CheckCircle2, Trophy, Trash2, Play, RefreshCw,
  Clock, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAssociationCompetitions } from '@/actions/scraping/fpf-competitions/browse';
import {
  FPF_ASSOCIATIONS,
  FPF_NATIONAL_YOUTH_COMPETITIONS,
  type FpfCompetitionBrowse,
} from '@/actions/scraping/fpf-competitions/fpf-data';
import {
  addCompetition,
  discoverCompetitionFixtures,
  scrapeOneFixture,
  updateCompetitionStats,
  getCompetitionSummary,
  deleteCompetition,
  type ScrapeLogEntry,
  type ScrapeProgress,
  type CompetitionSummary,
} from '@/actions/scraping/fpf-competitions/scrape-competition';
import { linkMatchPlayersToEskout } from '@/actions/scraping/fpf-competitions/link-players';
import { FPF_CLASS_TO_ESCALAO, ESCALAO_MATCH_DURATION, getAvailableSeasons } from '@/lib/constants';
import type { FpfCompetitionRow } from '@/lib/types';

/* ───────────── Types ───────────── */

type Tab = 'list' | 'browse';

/* ───────────── Component ───────────── */

export function CompetitionsClient({
  initialData,
  error,
}: {
  initialData: CompetitionSummary[];
  error?: string;
}) {
  const [summaries, setSummaries] = useState(initialData);
  const competitions = summaries.map((s) => s.competition);
  const [tab, setTab] = useState<Tab>(initialData.length > 0 ? 'list' : 'browse');

  // Browse state
  const [selectedAssociation, setSelectedAssociation] = useState<number | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(() => getAvailableSeasons()[0]);
  const [browseResults, setBrowseResults] = useState<FpfCompetitionBrowse[]>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [showNational, setShowNational] = useState(false);

  // Scraping state
  const [scrapingId, setScrapingId] = useState<number | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress | null>(null);
  const [scrapeLog, setScrapeLog] = useState<ScrapeLogEntry[]>([]);
  const [stopPending, setStopPending] = useState(false);
  const [logVisible, setLogVisible] = useState(true);
  const stopRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Scrape-all state: sequential batch across all competitions
  const [isScrapeAll, setIsScrapeAll] = useState(false);
  const [scrapeAllIndex, setScrapeAllIndex] = useState(0);
  const [scrapeAllTotal, setScrapeAllTotal] = useState(0);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<FpfCompetitionRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const seasons = getAvailableSeasons();

  // Auto-scroll log
  useEffect(() => {
    const container = logEndRef.current?.parentElement;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    if (isNearBottom) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [scrapeLog.length]);

  /* ───────────── Browse ───────────── */

  const handleBrowse = useCallback(async (associationId: number) => {
    setSelectedAssociation(associationId);
    setIsBrowsing(true);
    setBrowseError(null);
    setBrowseResults([]);
    setShowNational(false);

    const res = await getAssociationCompetitions(associationId, selectedSeason.seasonId);
    setIsBrowsing(false);

    if (res.success && res.data) {
      setBrowseResults(res.data);
      if (res.data.length === 0) setBrowseError('Nenhuma competição encontrada');
    } else {
      setBrowseError(res.error ?? 'Erro ao carregar');
    }
  }, [selectedSeason]);

  const handleShowNational = useCallback(() => {
    setSelectedAssociation(null);
    setShowNational(true);
    setBrowseResults([]);
    setBrowseError(null);
  }, []);

  /* ───────────── Add Competition ───────────── */

  async function handleAdd(comp: FpfCompetitionBrowse, classId?: number) {
    // Detect classId from competition name if not provided
    const detectedClassId = classId ?? detectClassId(comp.name);
    const escalao = detectedClassId ? FPF_CLASS_TO_ESCALAO[detectedClassId] ?? null : null;

    const res = await addCompetition({
      fpfCompetitionId: comp.id,
      fpfSeasonId: selectedSeason.seasonId,
      name: comp.name,
      associationName: selectedAssociation ? FPF_ASSOCIATIONS.find((a) => a.id === selectedAssociation)?.name : null,
      associationId: selectedAssociation,
      classId: detectedClassId,
      escalao,
      season: selectedSeason.label,
      matchDurationMinutes: escalao ? ESCALAO_MATCH_DURATION[escalao] : undefined,
    });

    if (res.success && res.data) {
      const newSummary: CompetitionSummary = {
        competition: res.data, seriesCount: 0, fixtureCount: 0, matchCount: 0, teamsCount: 0, playersCount: 0,
      };
      setSummaries((prev) => {
        const existing = prev.findIndex((s) => s.competition.id === res.data!.id);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...next[existing], competition: res.data! };
          return next;
        }
        return [newSummary, ...prev];
      });
      setTab('list');
    }
  }

  /* ───────────── Scrape ───────────── */

  async function handleScrape(competitionId: number) {
    setScrapingId(competitionId);
    setScrapeProgress(null);
    setScrapeLog([{ event: 'info', message: '🔍 A contactar FPF para descobrir jornadas…' }]);
    setLogVisible(true);
    stopRef.current = false;
    setStopPending(false);

    // Helper: yield to browser so React can flush state updates + check stop flag
    const yieldFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    /* ── Step 1: Discover fixtures ── */
    const discoverRes = await discoverCompetitionFixtures(competitionId);
    if (stopRef.current) { finishScrape(competitionId, null, true); return; }
    if (!discoverRes.success || !discoverRes.data) {
      setScrapeLog((prev) => [...prev, { event: 'info', message: `❌ Erro: ${discoverRes.error}` }]);
      setScrapingId(null);
      setStopPending(false);
      return;
    }

    const { fixtures, existingMatchIds, matchCountByFixture } = discoverRes.data;
    const knownIds = [...existingMatchIds];

    // Split fixtures into pending (need scraping) vs already-complete (have matches in DB)
    // A fixture with >0 matches in DB is considered complete — skip it entirely
    const pendingFixtures = fixtures.filter((f) => !matchCountByFixture[f.fixtureId]);
    const skippedFixtures = fixtures.length - pendingFixtures.length;

    // Log fixture summary grouped by phase/series
    const fixturesByCtx = new Map<string, number>();
    for (const f of pendingFixtures) {
      const ctx = [f.phaseName, f.seriesName].filter(Boolean).join(' — ') || 'Geral';
      fixturesByCtx.set(ctx, (fixturesByCtx.get(ctx) ?? 0) + 1);
    }
    const summaryParts = Array.from(fixturesByCtx.entries()).map(([ctx, count]) => `${ctx}: ${count} jornadas`);
    setScrapeLog((prev) => [
      ...prev,
      { event: 'info', message: `📋 ${fixtures.length} jornadas, ${skippedFixtures} já completas, ${pendingFixtures.length} a processar` },
      ...(fixturesByCtx.size > 1 ? summaryParts.map((s) => ({ event: 'info' as const, message: `   └ ${s}` })) : []),
    ]);

    const progress: ScrapeProgress = {
      totalFixtures: pendingFixtures.length,
      doneFixtures: 0,
      totalMatches: 0,
      scrapedMatches: existingMatchIds.length,
      newMatches: 0,
      skippedMatches: 0,
      errors: 0,
    };
    setScrapeProgress({ ...progress });
    await yieldFrame();

    // If nothing to do, finish immediately
    if (pendingFixtures.length === 0) {
      setScrapeLog((prev) => [...prev, { event: 'info', message: '✅ Tudo atualizado — sem jornadas novas' }]);
      finishScrape(competitionId, progress, false);
      return;
    }

    const fixturesToProcess = pendingFixtures;

    /* ── Step 2: Scrape only pending fixtures ── */
    for (let i = 0; i < fixturesToProcess.length; i++) {
      if (stopRef.current) break;

      const fixture = pendingFixtures[i];
      // Build context label: "Série A — Jornada 1" or "1.ª Fase — Jornada 3"
      const ctxLabel = [fixture.seriesName, fixture.phaseName].filter(Boolean).join(' — ');
      const label = ctxLabel ? `${fixture.name} (${ctxLabel})` : fixture.name;

      setScrapeLog((prev) => [
        ...prev,
        { event: 'info', message: `⏳ ${i + 1}/${fixturesToProcess.length}: ${label}` },
      ]);
      await yieldFrame();

      const res = await scrapeOneFixture(
        competitionId,
        fixture.fixtureId,
        fixture.name,
        fixture.phaseName,
        fixture.seriesName,
        knownIds,
      );

      // Check stop immediately after server returns
      if (stopRef.current) {
        // Still process the results from this last fixture
        if (res.success && res.data) {
          setScrapeLog((prev) => [...prev, ...res.data!.log]);
          knownIds.push(...res.data.newMatchIds);
          progress.newMatches += res.data.newMatches;
          progress.skippedMatches += res.data.skipped;
          progress.scrapedMatches += res.data.newMatches;
        }
        progress.doneFixtures = i + 1;
        setScrapeProgress({ ...progress });
        break;
      }

      if (!res.success) {
        setScrapeLog((prev) => [...prev, { event: 'fixture_fail', message: `${label} — erro: ${res.error}` }]);
        progress.errors++;
      } else {
        const d = res.data!;
        setScrapeLog((prev) => [...prev, ...d.log]);
        knownIds.push(...d.newMatchIds);
        progress.newMatches += d.newMatches;
        progress.skippedMatches += d.skipped;
        progress.errors += d.errors;
        progress.scrapedMatches += d.newMatches;
      }

      progress.doneFixtures = i + 1;
      setScrapeProgress({ ...progress });
      await yieldFrame();

      // Update DB stats every 5 fixtures
      if ((i + 1) % 5 === 0) {
        await updateCompetitionStats(competitionId, false);
      }
    }

    finishScrape(competitionId, progress, stopRef.current);
  }

  async function finishScrape(competitionId: number, progress: ScrapeProgress | null, wasStopped: boolean) {
    // Check stopRef live — user may press stop after scrape loop finishes but before link/import
    const stopped = () => wasStopped || stopRef.current;
    const finalStatus = stopped() ? 'partial' : 'complete';

    // Step 1: Update stats in DB
    await updateCompetitionStats(competitionId, !stopped());

    if (stopped()) {
      setScrapeLog((prev) => [...prev, { event: 'info', message: '⏹ Scraping parado pelo utilizador' }]);
    } else if (progress) {
      setScrapeLog((prev) => [...prev, {
        event: 'info',
        message: `✅ Scraping concluído — ${progress.newMatches} novos, ${progress.skippedMatches} ignorados, ${progress.errors} erros`,
      }]);
    }

    // Step 2: Link players to eskout (fast — DB only, no FPF requests)
    if (!stopped()) {
      setScrapeLog((prev) => [...prev, { event: 'info', message: '🔗 A ligar jogadores ao eskout…' }]);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const linkRes = await linkMatchPlayersToEskout(competitionId);
      if (linkRes.success && linkRes.data?.log?.length) {
        setScrapeLog((prev) => [...prev, ...linkRes.data!.log.map((e) => ({ event: 'info' as const, message: e.message }))]);
      }

      // Import is NOT run here — too slow (1 FPF fetch per player).
      // Use the "Não Ligados" tab in the competition detail page to see/import unlinked players.
      if (linkRes.success && linkRes.data && linkRes.data.unlinked > 0) {
        setScrapeLog((prev) => [...prev, {
          event: 'info',
          message: `📥 ${linkRes.data!.unlinked} jogadores não ligados — importa na página da competição (tab "Não Ligados")`,
        }]);
      }
    }

    // Re-fetch enriched summary from server to update stats
    const freshRes = await getCompetitionSummary(competitionId);
    if (freshRes.success && freshRes.data) {
      setSummaries((prev) => prev.map((s) => s.competition.id === competitionId ? freshRes.data! : s));
    } else {
      setSummaries((prev) => prev.map((s) =>
        s.competition.id === competitionId
          ? { ...s, competition: { ...s.competition, scrape_status: stopped() ? 'partial' : finalStatus, scraped_matches: progress?.scrapedMatches ?? s.competition.scraped_matches } }
          : s,
      ));
    }

    setScrapingId(null);
    setStopPending(false);
  }

  /* ───────────── Scrape All ───────────── */

  async function handleScrapeAll() {
    const compIds = competitions.map((c) => c.id);
    if (compIds.length === 0) return;

    setIsScrapeAll(true);
    setScrapeAllTotal(compIds.length);
    stopRef.current = false;
    setStopPending(false);

    for (let i = 0; i < compIds.length; i++) {
      if (stopRef.current) break;
      setScrapeAllIndex(i + 1);
      // Reuse existing handleScrape — it sets/clears scrapingId internally
      await handleScrape(compIds[i]);
      if (stopRef.current) break;
    }

    setIsScrapeAll(false);
    setScrapeAllIndex(0);
    setScrapeAllTotal(0);
  }

  function handleDeleteClick(id: number) {
    const comp = competitions.find((c) => c.id === id);
    if (comp) {
      setDeleteTarget(comp);
      setDeleteConfirmText('');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsDeleting(true);

    // Stop scraping if running on this competition
    if (scrapingId === deleteTarget.id) {
      stopRef.current = true;
    }

    const res = await deleteCompetition(deleteTarget.id);
    if (res.success) {
      setSummaries((prev) => prev.filter((s) => s.competition.id !== deleteTarget.id));
      if (scrapingId === deleteTarget.id) {
        setScrapingId(null);
        setScrapeLog([]);
        setScrapeProgress(null);
      }
    }
    setIsDeleting(false);
    setDeleteTarget(null);
  }

  /* ───────────── Helpers ───────────── */

  function detectClassId(name: string): number | null {
    const lower = name.toLowerCase();
    if (lower.includes('sub-19') || lower.includes('sub19') || lower.includes('júnior') || lower.includes('junior')) return 3;
    if (lower.includes('sub-17') || lower.includes('sub17') || lower.includes('juveni')) return 4;
    if (lower.includes('sub-15') || lower.includes('sub15') || lower.includes('iniciado')) return 5;
    if (lower.includes('sub-13') || lower.includes('sub13') || lower.includes('infanti')) return 6;
    if (lower.includes('sub-11') || lower.includes('sub11') || lower.includes('benjami')) return 8;
    if (lower.includes('sub-9') || lower.includes('sub9') || lower.includes('traquin')) return 9;
    if (lower.includes('sub-7') || lower.includes('sub7') || lower.includes('petiz')) return 10;
    return null;
  }

  /* ───────────── Render ───────────── */

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => setTab('list')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Competições ({competitions.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('browse')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'browse' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Plus className="mr-1 inline h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>

      {/* ───────────── Browse Tab ───────────── */}
      {tab === 'browse' && (
        <div className="space-y-4">
          {/* Season selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-muted-foreground">Época:</label>
            <select
              value={selectedSeason.seasonId}
              onChange={(e) => {
                const s = seasons.find((s) => s.seasonId === parseInt(e.target.value, 10));
                if (s) setSelectedSeason(s);
              }}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {seasons.map((s) => (
                <option key={s.seasonId} value={s.seasonId}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* National competitions shortcut */}
          <div>
            <button
              type="button"
              onClick={handleShowNational}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                showNational ? 'border-purple-300 bg-purple-50 text-purple-700' : 'hover:bg-muted'
              }`}
            >
              <Trophy className="mr-1.5 inline h-3.5 w-3.5" />
              Competições Nacionais
            </button>
          </div>

          {/* National competitions list */}
          {showNational && (
            <div className="space-y-1">
              {FPF_NATIONAL_YOUTH_COMPETITIONS.map((nc) => (
                <div key={nc.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{nc.name}</span>
                  <Button size="sm" variant="outline" onClick={() => handleAdd({ id: nc.id, name: nc.name, url: '' }, nc.classId)}>
                    <Plus className="mr-1 h-3 w-3" />
                    Adicionar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Association selector */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Ou escolher associação distrital:</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {FPF_ASSOCIATIONS.map((assoc) => (
                <button
                  key={assoc.id}
                  type="button"
                  onClick={() => handleBrowse(assoc.id)}
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    selectedAssociation === assoc.id ? 'border-purple-300 bg-purple-50 text-purple-700' : 'hover:bg-muted'
                  }`}
                >
                  {assoc.name}
                </button>
              ))}
            </div>
          </div>

          {/* Browse results */}
          {isBrowsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar competições…
            </div>
          )}

          {browseError && !isBrowsing && (
            <p className="text-sm text-muted-foreground">{browseError}</p>
          )}

          {browseResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{browseResults.length} competições encontradas:</p>
              {browseResults.map((comp) => (
                <div key={comp.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{comp.name}</span>
                    {detectClassId(comp.name) && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({FPF_CLASS_TO_ESCALAO[detectClassId(comp.name)!]})
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAdd(comp)}>
                    <Plus className="mr-1 h-3 w-3" />
                    Adicionar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───────────── List Tab ───────────── */}
      {tab === 'list' && (
        <div className="space-y-3">
          {/* Batch actions */}
          {competitions.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {isScrapeAll && (
                  <span>A atualizar {scrapeAllIndex}/{scrapeAllTotal}…</span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleScrapeAll}
                  disabled={scrapingId != null}
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${isScrapeAll ? 'animate-spin' : ''}`} />
                  Atualizar todas
                </Button>
              </div>
            </div>
          )}

          {competitions.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <Trophy className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhuma competição adicionada.</p>
              <Button variant="outline" size="sm" onClick={() => setTab('browse')}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar competição
              </Button>
            </div>
          )}

          {summaries.map((s) => (
            <CompetitionRow
              key={s.competition.id}
              summary={s}
              isScraping={scrapingId === s.competition.id}
              isStopping={scrapingId === s.competition.id && stopPending}
              onScrape={() => handleScrape(s.competition.id)}
              onDelete={() => handleDeleteClick(s.competition.id)}
            />
          ))}
        </div>
      )}

      {/* ───────────── Scraping Progress ───────────── */}
      {(scrapingId || scrapeLog.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {!scrapingId ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Scraping concluído
                </>
              ) : stopPending ? (
                <>
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-amber-600">A parar — a terminar jornada atual…</span>
                </>
              ) : (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Scraping em progresso
                </>
              )}
            </h3>
            <div className="flex gap-1">
              {scrapingId && (
                <Button
                  variant={stopPending ? 'default' : 'ghost'}
                  size="sm"
                  className={stopPending
                    ? 'text-xs bg-amber-500 text-white hover:bg-amber-600'
                    : 'text-xs text-muted-foreground hover:text-red-600'
                  }
                  onClick={() => {
                    stopRef.current = true;
                    setStopPending(true);
                    setScrapeLog((prev) => [...prev, { event: 'info', message: '🛑 Pedido de paragem — a terminar jornada atual…' }]);
                  }}
                  disabled={stopPending}
                >
                  {stopPending ? 'A parar…' : 'Parar'}
                </Button>
              )}
              {!scrapingId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setLogVisible((v) => !v)}
                >
                  {logVisible ? 'Esconder' : 'Mostrar log'}
                </Button>
              )}
            </div>
          </div>

          {logVisible && scrapeProgress && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Jornadas" value={`${scrapeProgress.doneFixtures}/${scrapeProgress.totalFixtures}`} />
              <MiniStat label="Jogos novos" value={String(scrapeProgress.newMatches)} />
              <MiniStat label="Já existentes" value={String(scrapeProgress.skippedMatches)} />
              <MiniStat label="Erros" value={String(scrapeProgress.errors)} />
            </div>
          )}

          {logVisible && scrapeLog.length > 0 && (
            <div className="rounded-lg border bg-muted/30 text-xs font-mono">
              <div className="border-b px-3 py-1.5 text-muted-foreground">Log ({scrapeLog.length})</div>
              <div className="max-h-[70vh] overflow-y-auto p-2 space-y-px">
                {scrapeLog.map((entry, i) => (
                  <div key={i} className={`leading-5 ${
                    entry.event === 'fixture_ok' ? 'text-emerald-600 font-medium' :
                    entry.event === 'match_ok' ? 'text-emerald-600' :
                    entry.event === 'fixture_fail' || entry.event === 'match_fail' ? 'text-red-600' :
                    entry.event === 'match_skip' ? 'text-muted-foreground/60' :
                    // Color link/import log entries by their prefix
                    entry.message.startsWith('✓') || entry.message.includes('] ✓') ? 'text-emerald-600' :
                    entry.message.startsWith('✗') || entry.message.includes('] ✗') ? 'text-red-500' :
                    entry.message.startsWith('⊘') || entry.message.includes('] ⊘') ? 'text-amber-500' :
                    'text-muted-foreground'
                  }`}>
                    {entry.message}
                    {entry.durationMs != null && (
                      <span className="ml-2 text-muted-foreground/60">{(entry.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────── Delete Confirmation Dialog ───────────── */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar competição?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Isto irá eliminar permanentemente <strong>{deleteTarget?.name}</strong> e todos os dados
                  associados (jogos, jogadores, eventos). Esta ação não pode ser revertida.
                </p>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-neutral-500">
                    Escreve <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-600">ELIMINAR</span> para confirmar
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                    placeholder="ELIMINAR"
                    className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium tracking-wider outline-none transition-colors focus:border-red-300 focus:ring-1 focus:ring-red-200 placeholder:text-neutral-300"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting || deleteConfirmText !== 'ELIMINAR'}
              className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
            >
              {isDeleting ? 'A eliminar...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────── Competition Row ───────────── */

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending: { icon: <Clock className="h-3.5 w-3.5" />, label: 'Pendente', color: 'text-muted-foreground' },
  scraping: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: 'A correr…', color: 'text-amber-600' },
  partial: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: 'Parcial', color: 'text-amber-600' },
  complete: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Completo', color: 'text-emerald-600' },
  error: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: 'Erro', color: 'text-red-600' },
};

function CompetitionRow({
  summary,
  isScraping,
  isStopping,
  onScrape,
  onDelete,
}: {
  summary: CompetitionSummary;
  isScraping: boolean;
  isStopping: boolean;
  onScrape: () => void;
  onDelete: () => void;
}) {
  const comp = summary.competition;

  // Override status when actively scraping or stopping
  const status = isStopping
    ? { icon: <Clock className="h-3.5 w-3.5" />, label: 'A parar…', color: 'text-amber-600' }
    : isScraping
      ? STATUS_CONFIG.scraping
      : STATUS_CONFIG[comp.scrape_status] ?? STATUS_CONFIG.pending;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/master/competicoes/${comp.id}`} className="text-sm font-semibold hover:underline">
            {comp.name}
          </Link>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{comp.season}</span>
            {comp.association_name && <span>{comp.association_name}</span>}
            {comp.escalao && <span className="font-medium text-purple-600">{comp.escalao}</span>}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-xs whitespace-nowrap ${status.color}`}>
          {status.icon}
          {status.label}
        </div>
      </div>

      {/* Stats row — show series, teams, matches, players */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        {summary.seriesCount > 0 && (
          <span>{summary.seriesCount} {summary.seriesCount === 1 ? 'série' : 'séries'}</span>
        )}
        {summary.teamsCount > 0 && (
          <span>{summary.teamsCount} equipas</span>
        )}
        <span>{summary.matchCount} jogos</span>
        {summary.playersCount > 0 && (
          <span>{summary.playersCount} jogadores</span>
        )}
        {comp.last_scraped_at && (
          <span>Último scrape: {new Date(comp.last_scraped_at).toLocaleDateString('pt-PT')}</span>
        )}
      </div>

      <div className="flex items-center justify-end">
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onScrape}
            disabled={isScraping}
          >
            {comp.scrape_status === 'complete' ? (
              <><RefreshCw className="mr-1 h-3 w-3" />Atualizar</>
            ) : comp.scrape_status === 'partial' ? (
              <><Play className="mr-1 h-3 w-3" />Continuar</>
            ) : (
              <><Play className="mr-1 h-3 w-3" />Scrape</>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground/50 hover:text-red-500"
            onClick={onDelete}
            disabled={isScraping}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Mini Stat ───────────── */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
