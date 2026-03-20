// src/app/master/competicoes/CompetitionsClient.tsx
// Client component for browsing, adding, and scraping FPF competitions
// Combines competition browser, tracked list, and scraping progress into one view
// RELEVANT FILES: src/actions/scraping/fpf-competitions/browse.ts, src/actions/scraping/fpf-competitions/scrape-competition.ts

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus, Loader2, CheckCircle2, Trophy, Trash2, Play, RefreshCw,
  Clock, Check, ChevronRight,
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
  const isScrapeAllRef = useRef(false); // Ref mirror for async access inside finishScrape
  const [scrapeAllIndex, setScrapeAllIndex] = useState(0);
  const [scrapeAllTotal, setScrapeAllTotal] = useState(0);
  const [scrapeAllDone, setScrapeAllDone] = useState<Set<number>>(new Set()); // IDs already updated in batch

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<FpfCompetitionRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Collapsible escalão groups — all start collapsed
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((escalao: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(escalao)) next.delete(escalao); else next.add(escalao);
      return next;
    });
  }, []);

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
        competition: res.data, seriesCount: 0, fixtureCount: 0, matchCount: 0, teamsCount: 0, playersCount: 0, linkedPlayersCount: 0, unlinkedPlayersCount: 0,
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
      // Stay on browse tab — the row turns green with "Já adicionada" badge
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

      // Re-compute denormalized stats after linking (player counts changed)
      await updateCompetitionStats(competitionId, true);
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

    // Only clear scraping state if NOT in a batch "scrape all" — batch manages its own lifecycle
    if (isScrapeAllRef.current) {
      setScrapeAllDone((prev) => new Set([...prev, competitionId]));
    } else {
      setScrapingId(null);
      setStopPending(false);
    }
  }

  /* ───────────── Scrape All ───────────── */

  async function handleScrapeAll() {
    // Sort by escalão (same visual order as the grouped list) then by position within group
    const ESCALAO_ORDER = ['Sénior', 'Sub-19', 'Sub-17', 'Sub-15', 'Sub-13', 'Sub-11', 'Sub-9', 'Sub-7'];
    const sorted = [...summaries].sort((a, b) => {
      const ea = ESCALAO_ORDER.indexOf(a.competition.escalao || '');
      const eb = ESCALAO_ORDER.indexOf(b.competition.escalao || '');
      return (ea === -1 ? 999 : ea) - (eb === -1 ? 999 : eb);
    });
    const compIds = sorted.map((s) => s.competition.id);
    if (compIds.length === 0) return;

    setIsScrapeAll(true);
    isScrapeAllRef.current = true;
    setScrapeAllTotal(compIds.length);
    setScrapeAllDone(new Set());
    stopRef.current = false;
    setStopPending(false);

    for (let i = 0; i < compIds.length; i++) {
      if (stopRef.current) break;
      setScrapeAllIndex(i + 1);
      await handleScrape(compIds[i]);
      if (stopRef.current) break;
    }

    // Clean up batch state + clear scraping state that finishScrape skipped
    setIsScrapeAll(false);
    isScrapeAllRef.current = false;
    setScrapeAllIndex(0);
    setScrapeAllTotal(0);
    setScrapeAllDone(new Set());
    setScrapingId(null);
    setStopPending(false);
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
    // Normalize separators: "Sub/15", "Sub-15", "Sub15", "Sub 15" → all matched
    const lower = name.toLowerCase().replace(/sub[\s/.-]*(\d)/g, 'sub-$1');
    if (lower.includes('sub-19') || lower.includes('júnior') || lower.includes('junior')) return 3;
    if (lower.includes('sub-18')) return 3; // Sub-18 = Juniores A = Sub-19 class
    if (lower.includes('sub-17') || lower.includes('juveni')) return 4;
    if (lower.includes('sub-16')) return 4; // Sub-16 = Juniores B = Sub-17 class
    if (lower.includes('sub-15') || lower.includes('iniciado')) return 5;
    if (lower.includes('sub-14')) return 5; // Sub-14 = Juniores C = Sub-15 class
    if (lower.includes('sub-13') || lower.includes('infanti')) return 6;
    if (lower.includes('sub-12')) return 6; // Sub-12 = Juniores D = Sub-13 class
    if (lower.includes('sub-11') || lower.includes('benjami')) return 8;
    if (lower.includes('sub-10')) return 8; // Sub-10 = Benjamins = Sub-11 class
    if (lower.includes('sub-9') || lower.includes('traquin')) return 9;
    if (lower.includes('sub-7') || lower.includes('petiz')) return 10;
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
              {FPF_NATIONAL_YOUTH_COMPETITIONS.map((nc) => {
                const isTracked = competitions.some(
                  (c) => c.fpf_competition_id === nc.id && c.fpf_season_id === selectedSeason.seasonId,
                );
                return (
                  <div
                    key={nc.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                      isTracked ? 'border-emerald-200 bg-emerald-50/50' : ''
                    }`}
                  >
                    <span className={`font-medium ${isTracked ? 'text-emerald-700' : ''}`}>{nc.name}</span>
                    {isTracked ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <Check className="h-3 w-3" />
                        Já adicionada
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleAdd({ id: nc.id, name: nc.name, url: '' }, nc.classId)}>
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar
                      </Button>
                    )}
                  </div>
                );
              })}
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
              {browseResults.map((comp) => {
                const isTracked = competitions.some(
                  (c) => c.fpf_competition_id === comp.id && c.fpf_season_id === selectedSeason.seasonId,
                );
                return (
                  <div
                    key={comp.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                      isTracked ? 'border-emerald-200 bg-emerald-50/50' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className={`font-medium ${isTracked ? 'text-emerald-700' : ''}`}>{comp.name}</span>
                      {detectClassId(comp.name) && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({FPF_CLASS_TO_ESCALAO[detectClassId(comp.name)!]})
                        </span>
                      )}
                    </div>
                    {isTracked ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <Check className="h-3 w-3" />
                        Já adicionada
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleAdd(comp)}>
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar
                      </Button>
                    )}
                  </div>
                );
              })}
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

          {/* Group by escalão, ordered oldest → youngest, collapsible */}
          {(() => {
            const ESCALAO_ORDER = ['Sénior', 'Sub-19', 'Sub-17', 'Sub-15', 'Sub-13', 'Sub-11', 'Sub-9', 'Sub-7'];
            const groups = new Map<string, CompetitionSummary[]>();
            for (const s of summaries) {
              const key = s.competition.escalao || 'Sem escalão';
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(s);
            }
            const sortedKeys = [...groups.keys()].sort((a, b) => {
              const ia = ESCALAO_ORDER.indexOf(a);
              const ib = ESCALAO_ORDER.indexOf(b);
              return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });
            return sortedKeys.map((escalao) => {
              const items = groups.get(escalao)!;
              const isOpen = expandedGroups.has(escalao);

              // Aggregate stats for collapsed summary
              const totalMatches = items.reduce((sum, s) => sum + s.matchCount, 0);
              const totalTeams = items.reduce((sum, s) => sum + s.teamsCount, 0);
              const totalPlayers = items.reduce((sum, s) => sum + s.playersCount, 0);
              const totalLinked = items.reduce((sum, s) => sum + s.linkedPlayersCount, 0);
              const totalUnlinked = items.reduce((sum, s) => sum + s.unlinkedPlayersCount, 0);

              return (
                <div key={escalao}>
                  {/* Collapsible header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(escalao)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                      {escalao}
                    </span>
                    <span className="text-xs text-muted-foreground">{items.length} comp.</span>
                    <span className="h-px flex-1 bg-border" />

                    {/* Summary pills — always visible (collapsed and expanded) */}
                    <div className="flex items-center gap-1.5">
                      {totalTeams > 0 && (
                        <StatPill value={totalTeams} label="equipas" color="bg-blue-50 text-blue-700" />
                      )}
                      <StatPill
                        value={totalMatches}
                        label="jogos"
                        color={totalMatches > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-neutral-100 text-neutral-400'}
                      />
                      {totalPlayers > 0 && (
                        <StatPill value={totalPlayers} label="jogadores" color="bg-cyan-50 text-cyan-700" />
                      )}
                      {totalPlayers > 0 && (
                        <StatPill
                          value={`${totalLinked}/${totalPlayers}`}
                          label="ligados"
                          color={totalUnlinked === 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : totalLinked >= totalUnlinked
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }
                        />
                      )}
                    </div>
                  </button>

                  {/* Expanded: show individual competition rows */}
                  {isOpen && (
                    <div className="space-y-1.5 pl-6 pt-1">
                      {items.map((s) => (
                        <CompetitionRow
                          key={s.competition.id}
                          summary={s}
                          isScraping={scrapingId === s.competition.id}
                          isStopping={scrapingId === s.competition.id && stopPending}
                          batchDone={isScrapeAll && scrapeAllDone.has(s.competition.id)}
                          onScrape={() => handleScrape(s.competition.id)}
                          onDelete={() => handleDeleteClick(s.competition.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
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

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending:  { label: 'Pendente',   bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  scraping: { label: 'A correr…',  bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  partial:  { label: 'Parcial',    bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  complete: { label: 'Completo',   bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  error:    { label: 'Erro',       bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500' },
};

/** Colored action/status tag for the competition checklist row */
const ACTION_TAG_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-neutral-50 text-neutral-500 ring-neutral-200',
};

function ActionTag({ color, icon, children }: { color: string; icon: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${ACTION_TAG_COLORS[color] ?? ACTION_TAG_COLORS.neutral}`}>
      <span className="text-[9px]">{icon}</span>
      {children}
    </span>
  );
}

/** Compact stat pill with visible label text */
function StatPill({ value, label, color = 'bg-neutral-100 text-neutral-600' }: {
  value: string | number;
  label: string;
  color?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight ${color}`}>
      <span className="font-bold tabular-nums">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

function CompetitionRow({
  summary,
  isScraping,
  isStopping,
  batchDone,
  onScrape,
  onDelete,
}: {
  summary: CompetitionSummary;
  isScraping: boolean;
  isStopping: boolean;
  batchDone?: boolean;
  onScrape: () => void;
  onDelete: () => void;
}) {
  const comp = summary.competition;

  // Override status when actively scraping or stopping
  const statusKey = isStopping ? 'scraping' : isScraping ? 'scraping' : comp.scrape_status;
  const status = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending;
  const statusLabel = isStopping ? 'A parar…' : status.label;

  // Determine actionable insights
  const hasUnlinked = summary.unlinkedPlayersCount > 0;
  const linkPercent = summary.playersCount > 0
    ? Math.round((summary.linkedPlayersCount / summary.playersCount) * 100)
    : 0;

  return (
    <div className={`rounded-lg border p-2.5 space-y-1.5 transition-colors ${
      isScraping ? 'border-amber-200 bg-amber-50/30'
        : batchDone ? 'border-emerald-200 bg-emerald-50/30'
        : 'hover:bg-muted/30'
    }`}>
      {/* Row 1: Name + escalão badge + status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link href={`/master/competicoes/${comp.id}`} className="text-sm font-semibold hover:underline truncate">
            {comp.name}
          </Link>
          {comp.escalao && (
            <span className="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
              {comp.escalao}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Status badge — show "Atualizado" checkmark during batch for completed ones */}
          {batchDone ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <Check className="h-2.5 w-2.5" />
              Atualizado
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.bg} ${status.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusKey === 'scraping' ? 'animate-pulse' : ''} ${status.dot}`} />
              {statusLabel}
            </span>
          )}
          {/* Actions */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onScrape}
            disabled={isScraping}
            title={comp.scrape_status === 'complete' ? 'Atualizar' : comp.scrape_status === 'partial' ? 'Continuar' : 'Scrape'}
          >
            {comp.scrape_status === 'complete'
              ? <RefreshCw className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              : <Play className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            }
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground/40 hover:text-red-500"
            onClick={onDelete}
            disabled={isScraping}
            title="Eliminar"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Row 2: Metadata line */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>{comp.season}</span>
        {comp.association_name && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span>{comp.association_name}</span>
          </>
        )}
        {comp.last_scraped_at && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span>Atualizado {new Date(comp.last_scraped_at).toLocaleDateString('pt-PT')}</span>
          </>
        )}
      </div>

      {/* Row 3: Stat pills — text labels for clarity */}
      <div className="flex flex-wrap items-center gap-1">
        {summary.seriesCount > 0 && (
          <StatPill
            value={summary.seriesCount}
            label={summary.seriesCount === 1 ? 'série' : 'séries'}
          />
        )}
        {summary.teamsCount > 0 && (
          <StatPill value={summary.teamsCount} label="equipas" color="bg-blue-50 text-blue-700" />
        )}
        <StatPill
          value={summary.matchCount}
          label="jogos"
          color={summary.matchCount > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-neutral-100 text-neutral-400'}
        />
        {summary.playersCount > 0 && (
          <StatPill value={summary.playersCount} label="jogadores" color="bg-cyan-50 text-cyan-700" />
        )}

        {/* Linked players — shows fraction + color indicates health */}
        {summary.playersCount > 0 && (
          <StatPill
            value={`${summary.linkedPlayersCount}/${summary.playersCount}`}
            label="ligados"
            color={linkPercent === 100
              ? 'bg-emerald-50 text-emerald-700'
              : linkPercent >= 50
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-700'
            }
          />
        )}
      </div>

      {/* Row 4: Linking status — the actionable info */}
      {summary.playersCount > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {hasUnlinked ? (
            <Link href={`/master/competicoes/${comp.id}`} className="transition-colors hover:opacity-80">
              <ActionTag color="orange" icon="→">{summary.unlinkedPlayersCount} jogadores por ligar</ActionTag>
            </Link>
          ) : (
            <ActionTag color="emerald" icon="✓">Todos ligados</ActionTag>
          )}
        </div>
      )}
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
