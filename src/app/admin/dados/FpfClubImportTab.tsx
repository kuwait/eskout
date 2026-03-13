// src/app/admin/dados/FpfClubImportTab.tsx
// Client component for importing registered players from FPF club pages
// Multi-club queue: search clubs → pick escalões per club → import all at once with live dashboard
// RELEVANT FILES: src/actions/scraping/fpf-club-import.ts, src/app/admin/dados/page.tsx

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, Loader2, CheckCircle2, Building2, Download, Plus, Trash2, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  searchFpfClubs,
  getFpfClubPlayers,
  importFpfPlayerBatch,
  finishFpfImport,
  type FpfClubSearchResult,
  type FpfClubPlayer,
} from '@/actions/scraping/fpf-club-import';
import { humanDelay } from '@/actions/scraping/helpers';

/* ───────────── FPF Escalão Mapping ───────────── */

const FPF_CLASSES = [
  { classId: 10, label: 'Sub-7 (Petiz)' },
  { classId: 9, label: 'Sub-9 (Traquina)' },
  { classId: 8, label: 'Sub-11 (Benjamim)' },
  { classId: 6, label: 'Sub-13 (Infantil)' },
  { classId: 5, label: 'Sub-15 (Iniciado)' },
  { classId: 4, label: 'Sub-17 (Juvenil)' },
  { classId: 3, label: 'Sub-19 (Júnior)' },
  { classId: 2, label: 'Sénior' },
];

/* ───────────── Queue Persistence ───────────── */

const QUEUE_STORAGE_KEY = 'fpf-import-queue';

interface SerializedQueueItem {
  club: FpfClubSearchResult;
  classes: number[];
}

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SerializedQueueItem[];
    return parsed.map((item) => ({ club: item.club, classes: new Set(item.classes) }));
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]) {
  const serialized: SerializedQueueItem[] = queue.map((item) => ({
    club: item.club,
    classes: Array.from(item.classes),
  }));
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(serialized));
}

/* ───────────── Types ───────────── */

interface QueueItem {
  club: FpfClubSearchResult;
  classes: Set<number>;
}

interface LogEntry {
  ts: string;
  event: 'info' | 'escalao_ok' | 'escalao_fail' | 'player_ok' | 'player_fail' | 'player_slow';
  message: string;
  durationMs?: number;
}

// Per-club tracking for the dashboard
interface ClubStatus {
  clubName: string;
  totalEscaloes: number;
  doneEscaloes: number;
  totalPlayers: number;
  processedPlayers: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  status: 'pending' | 'fetching' | 'importing' | 'done';
}

interface ImportProgress {
  // Global counters
  totalClubs: number;
  doneClubs: number;
  totalEscaloes: number;
  doneEscaloes: number;
  totalPlayers: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  currentClub: string;
  currentName: string;
  // Timing
  startedAt: number;
  avgPlayerMs: number;
}

type Phase = 'queue' | 'importing' | 'done';

const SLOW_THRESHOLD_MS = 8000;
const BATCH_SIZE = 10;
const CONCURRENCY = 5;

/* ───────────── Component ───────────── */

export function FpfClubImportTab() {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FpfClubSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  // Escalão config for the club being added
  const [configClub, setConfigClub] = useState<FpfClubSearchResult | null>(null);
  const [configClasses, setConfigClasses] = useState<Set<number>>(() => new Set(FPF_CLASSES.map((c) => c.classId)));

  // Multi-club queue — persisted to localStorage so it survives refreshes
  const [queue, setQueue] = useState<QueueItem[]>(() => loadQueue());

  // Import state
  const [phase, setPhase] = useState<Phase>('queue');
  const [progress, setProgress] = useState<ImportProgress>({
    totalClubs: 0, doneClubs: 0, totalEscaloes: 0, doneEscaloes: 0,
    totalPlayers: 0, processed: 0, created: 0, updated: 0, unchanged: 0, errors: 0,
    currentClub: '', currentName: '', startedAt: 0, avgPlayerMs: 0,
  });
  const [clubStatuses, setClubStatuses] = useState<ClubStatus[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const importStartRef = useRef('');
  // Track total duration of player processing for average calculation
  const totalPlayerMsRef = useRef(0);

  // Persist queue to localStorage on every change
  useEffect(() => { saveQueue(queue); }, [queue]);

  // Auto-scroll log only if user is near the bottom
  useEffect(() => {
    const container = logEndRef.current?.parentElement;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    if (isNearBottom) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  /* ───────────── Helpers ───────────── */

  function addLog(entry: Omit<LogEntry, 'ts'>) {
    setLog((prev) => [...prev, { ...entry, ts: new Date().toISOString() }]);
  }

  function formatDuration(ms: number): string {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remainSec = sec % 60;
    return `${min}m ${remainSec}s`;
  }

  function estimateRemaining(): string {
    if (progress.processed === 0 || progress.avgPlayerMs === 0) return '…';
    const remaining = progress.totalPlayers - progress.processed;
    // With concurrency, effective time per player is avg / concurrency
    const effectiveMs = (progress.avgPlayerMs / CONCURRENCY) * remaining;
    return formatDuration(effectiveMs);
  }

  /* ───────────── Search ───────────── */

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchResults([]);
    setSearchError(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.trim().length < 2) return;

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      const res = await searchFpfClubs(query);
      setIsSearching(false);
      if (res.success && res.data) {
        setSearchResults(res.data);
        if (res.data.length === 0) setSearchError('Nenhum clube encontrado');
      } else {
        setSearchError(res.error ?? 'Erro na pesquisa');
      }
    }, 400);
  }, []);

  function selectClub(club: FpfClubSearchResult) {
    setConfigClub(club);
    setSearchResults([]);
    setSearchQuery('');
    setConfigClasses(new Set(FPF_CLASSES.map((c) => c.classId)));
  }

  function cancelConfig() {
    setConfigClub(null);
    setSearchQuery('');
  }

  function addToQueue() {
    if (!configClub || configClasses.size === 0) return;
    setQueue((prev) => {
      const filtered = prev.filter((q) => q.club.id !== configClub.id);
      return [...filtered, { club: configClub, classes: new Set(configClasses) }];
    });
    setConfigClub(null);
    setSearchQuery('');
  }

  function removeFromQueue(clubId: number) {
    setQueue((prev) => prev.filter((q) => q.club.id !== clubId));
  }

  function toggleConfigClass(classId: number) {
    setConfigClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  /* ───────────── Import ───────────── */

  async function startImport() {
    if (queue.length === 0) return;
    stopRef.current = false;
    totalPlayerMsRef.current = 0;
    importStartRef.current = new Date().toISOString();
    setLog([]);
    setPhase('importing');

    const totalEscaloes = queue.reduce((sum, q) => sum + q.classes.size, 0);
    setProgress({
      totalClubs: queue.length, doneClubs: 0, totalEscaloes, doneEscaloes: 0,
      totalPlayers: 0, processed: 0, created: 0, updated: 0, unchanged: 0, errors: 0,
      currentClub: '', currentName: '', startedAt: Date.now(), avgPlayerMs: 0,
    });

    // Initialize per-club tracking
    const initialStatuses: ClubStatus[] = queue.map((q) => ({
      clubName: q.club.name,
      totalEscaloes: q.classes.size,
      doneEscaloes: 0,
      totalPlayers: 0,
      processedPlayers: 0,
      created: 0, updated: 0, unchanged: 0, errors: 0,
      status: 'pending',
    }));
    setClubStatuses(initialStatuses);

    // ─── Phase 1: Fetch all escalões across all clubs ───
    const allPlayers: { player: FpfClubPlayer; clubName: string; clubIdx: number }[] = [];
    const seenUrls = new Set<string>();
    let escaloesDone = 0;

    for (let qi = 0; qi < queue.length; qi++) {
      if (stopRef.current) break;
      const { club, classes } = queue[qi];
      setProgress((prev) => ({ ...prev, currentClub: club.name }));
      setClubStatuses((prev) => prev.map((s, i) => i === qi ? { ...s, status: 'fetching' } : s));
      addLog({ event: 'info', message: `📋 ${club.name} — a buscar ${classes.size} escalões…` });

      const sortedClasses = Array.from(classes).sort((a, b) => a - b);
      for (let ci = 0; ci < sortedClasses.length; ci++) {
        if (stopRef.current) break;
        const classId = sortedClasses[ci];
        const classLabel = FPF_CLASSES.find((c) => c.classId === classId)?.label ?? `#${classId}`;

        const t0 = Date.now();
        const res = await getFpfClubPlayers(club.id, classId);
        const ms = Date.now() - t0;

        if (res.success && res.data) {
          let added = 0;
          for (const p of res.data) {
            if (!seenUrls.has(p.url)) {
              seenUrls.add(p.url);
              allPlayers.push({ player: p, clubName: club.name, clubIdx: qi });
              added++;
            }
          }
          addLog({ event: 'escalao_ok', message: `${club.name} › ${classLabel} — ${added} jogadores`, durationMs: ms });
          setClubStatuses((prev) => prev.map((s, i) => i === qi ? { ...s, doneEscaloes: s.doneEscaloes + 1, totalPlayers: s.totalPlayers + added } : s));
        } else {
          addLog({ event: 'escalao_fail', message: `${club.name} › ${classLabel} — ${res.error ?? 'falhou'}`, durationMs: ms });
          setClubStatuses((prev) => prev.map((s, i) => i === qi ? { ...s, doneEscaloes: s.doneEscaloes + 1 } : s));
        }
        escaloesDone++;
        setProgress((prev) => ({ ...prev, doneEscaloes: escaloesDone }));
        if (!stopRef.current) await humanDelay(2000, 3000);
      }

      setClubStatuses((prev) => prev.map((s, i) => i === qi ? { ...s, status: 'importing' } : s));
    }

    if (stopRef.current) { setPhase('done'); return; }

    // ─── Phase 2: Import all players in batches ───
    addLog({ event: 'info', message: `🚀 A importar ${allPlayers.length} jogadores (batches de ${BATCH_SIZE}, ${CONCURRENCY} concorrentes)` });
    setProgress((prev) => ({ ...prev, totalPlayers: allPlayers.length, currentClub: '' }));

    for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
      if (stopRef.current) break;

      const batch = allPlayers.slice(i, i + BATCH_SIZE);
      const batchNames = batch.map((b) => b.player.name.split(' ').slice(0, 2).join(' '));
      setProgress((prev) => ({ ...prev, currentName: batchNames.slice(0, 3).join(', '), currentClub: batch[0].clubName }));

      const { results, log: batchLog } = await importFpfPlayerBatch(
        batch.map((b) => b.player),
        batch[0].clubName,
        CONCURRENCY,
      );

      // Push server log entries to live log
      for (const entry of batchLog) {
        const actionLabel = entry.action === 'created' ? 'criado' : entry.action === 'updated' ? 'atualizado' : 'sem alterações';
        const suffix = entry.detail ? ` (${entry.detail})` : '';
        addLog({
          event: entry.event === 'fail' ? 'player_fail' : entry.event === 'slow' ? 'player_slow' : 'player_ok',
          message: `${entry.player} — ${entry.event === 'fail' ? (entry.detail ?? 'erro') : `${actionLabel}${suffix}`}`,
          durationMs: entry.durationMs,
        });
        totalPlayerMsRef.current += entry.durationMs;
      }

      // Tally per-club and global results
      const clubTally: Record<number, { created: number; updated: number; unchanged: number; errors: number; count: number }> = {};
      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        const cidx = batch[j].clubIdx;
        if (!clubTally[cidx]) clubTally[cidx] = { created: 0, updated: 0, unchanged: 0, errors: 0, count: 0 };
        clubTally[cidx].count++;
        const action = res.success ? res.data?.action : null;
        if (action === 'created') clubTally[cidx].created++;
        else if (action === 'updated') clubTally[cidx].updated++;
        else if (action === 'unchanged') clubTally[cidx].unchanged++;
        if (!res.success) clubTally[cidx].errors++;
      }

      // Update per-club statuses
      setClubStatuses((prev) => prev.map((s, idx) => {
        const t = clubTally[idx];
        if (!t) return s;
        return { ...s, processedPlayers: s.processedPlayers + t.count, created: s.created + t.created, updated: s.updated + t.updated, unchanged: s.unchanged + t.unchanged, errors: s.errors + t.errors };
      }));

      // Update global progress
      const batchProcessed = Math.min(i + batch.length, allPlayers.length);
      const newAvg = batchProcessed > 0 ? Math.round(totalPlayerMsRef.current / batchProcessed) : 0;
      let created = 0, updated = 0, unchanged = 0, errors = 0;
      for (const res of results) {
        const action = res.success ? res.data?.action : null;
        if (action === 'created') created++;
        else if (action === 'updated') updated++;
        else if (action === 'unchanged') unchanged++;
        if (!res.success) errors++;
      }

      setProgress((prev) => ({
        ...prev,
        processed: batchProcessed,
        created: prev.created + created,
        updated: prev.updated + updated,
        unchanged: prev.unchanged + unchanged,
        errors: prev.errors + errors,
        avgPlayerMs: newAvg,
      }));

      // Mark clubs as done when all their players are processed
      setClubStatuses((prev) => prev.map((s) => {
        if (s.status === 'importing' && s.totalPlayers > 0 && s.processedPlayers + (clubTally[prev.indexOf(s)]?.count ?? 0) >= s.totalPlayers) {
          return { ...s, status: 'done' };
        }
        return s;
      }));
    }

    // Mark remaining clubs as done
    setClubStatuses((prev) => prev.map((s) => ({ ...s, status: 'done' })));
    setProgress((prev) => ({ ...prev, doneClubs: prev.totalClubs }));

    await finishFpfImport();
    const elapsed = formatDuration(Date.now() - progress.startedAt);
    addLog({ event: 'info', message: `✅ Concluído — ${allPlayers.length} jogadores em ${elapsed}` });
    setPhase('done');
  }

  function stopImport() {
    stopRef.current = true;
    addLog({ event: 'info', message: '⏹ Importação parada pelo utilizador' });
    setPhase('done');
  }

  function resetAll() {
    setQueue([]);
    localStorage.removeItem(QUEUE_STORAGE_KEY);
    setConfigClub(null);
    setSearchQuery('');
    setLog([]);
    setClubStatuses([]);
    setPhase('queue');
    setProgress({
      totalClubs: 0, doneClubs: 0, totalEscaloes: 0, doneEscaloes: 0,
      totalPlayers: 0, processed: 0, created: 0, updated: 0, unchanged: 0, errors: 0,
      currentClub: '', currentName: '', startedAt: 0, avgPlayerMs: 0,
    });
    stopRef.current = false;
  }

  function downloadLog() {
    const playerEntries = log.filter((e) => e.durationMs != null && (e.event === 'player_ok' || e.event === 'player_fail' || e.event === 'player_slow'));
    const avgMs = playerEntries.length > 0
      ? Math.round(playerEntries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / playerEntries.length)
      : 0;

    const summary = {
      clubs: queue.map((q) => q.club.name),
      startedAt: importStartRef.current,
      finishedAt: new Date().toISOString(),
      totalDurationSec: Math.round((Date.now() - new Date(importStartRef.current).getTime()) / 1000),
      totalPlayers: progress.totalPlayers,
      created: progress.created,
      updated: progress.updated,
      unchanged: progress.unchanged,
      errors: progress.errors,
      concurrency: CONCURRENCY,
      batchSize: BATCH_SIZE,
      avgPlayerMs: avgMs,
      slowCount: log.filter((e) => e.event === 'player_slow').length,
      entries: log,
    };

    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fpf-import-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ───────────── Render ───────────── */

  const pct = progress.totalPlayers > 0 ? Math.round((progress.processed / progress.totalPlayers) * 100) : 0;
  const escaloesPct = progress.totalEscaloes > 0 ? Math.round((progress.doneEscaloes / progress.totalEscaloes) * 100) : 0;
  const totalQueuedClasses = queue.reduce((sum, q) => sum + q.classes.size, 0);
  const isQueuePhase = phase === 'queue';
  const elapsed = progress.startedAt > 0 ? formatDuration(Date.now() - progress.startedAt) : '';

  return (
    <div className="space-y-4">
      {/* ───────────── Search bar ───────────── */}
      {isQueuePhase && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
          <Input
            placeholder="Pesquisar clube na FPF..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-10 pl-9 pr-8 text-sm"
          />
          {searchQuery && (
            <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/50 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {isSearching && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}

          {searchError && !isSearching && searchResults.length === 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover px-3 py-2.5 text-sm text-muted-foreground shadow-md">
              {searchError}
            </div>
          )}

          {searchResults.length > 0 && !configClub && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-md">
              {searchResults.map((club) => (
                <button key={club.id} type="button" onClick={() => selectClub(club)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{club.name}</span>
                  {queue.some((q) => q.club.id === club.id) && <span className="ml-auto text-xs text-muted-foreground">(na fila)</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───────────── Escalão picker ───────────── */}
      {configClub && isQueuePhase && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{configClub.name}</h3>
            </div>
            <button type="button" onClick={cancelConfig} className="rounded-full p-1 text-muted-foreground/50 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Escalões:</p>
            <button
              type="button"
              onClick={() => {
                const allSelected = configClasses.size === FPF_CLASSES.length;
                setConfigClasses(allSelected ? new Set() : new Set(FPF_CLASSES.map((c) => c.classId)));
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {configClasses.size === FPF_CLASSES.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FPF_CLASSES.map((cls) => (
              <label
                key={cls.classId}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  configClasses.has(cls.classId) ? 'border-foreground bg-foreground/5' : 'border-border'
                }`}
              >
                <Checkbox checked={configClasses.has(cls.classId)} onCheckedChange={() => toggleConfigClass(cls.classId)} />
                {cls.label}
              </label>
            ))}
          </div>

          <Button onClick={addToQueue} disabled={configClasses.size === 0} size="sm" className="w-full sm:w-auto">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Adicionar à fila ({configClasses.size} {configClasses.size === 1 ? 'escalão' : 'escalões'})
          </Button>
        </div>
      )}

      {/* ───────────── Queue ───────────── */}
      {queue.length > 0 && isQueuePhase && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Fila de importação ({queue.length} {queue.length === 1 ? 'clube' : 'clubes'}, {totalQueuedClasses} escalões):</p>
          {queue.map((item) => (
            <div key={item.club.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.club.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {Array.from(item.classes).sort((a, b) => a - b).map((cid) => FPF_CLASSES.find((c) => c.classId === cid)?.label.split(' ')[0] ?? cid).join(', ')}
                </p>
              </div>
              <button type="button" onClick={() => removeFromQueue(item.club.id)} className="shrink-0 rounded-full p-1 text-muted-foreground/40 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <Button onClick={startImport} className="w-full sm:w-auto">
            Importar tudo ({queue.length} {queue.length === 1 ? 'clube' : 'clubes'})
          </Button>
        </div>
      )}

      {/* ───────────── Import Dashboard ───────────── */}
      {(phase === 'importing' || phase === 'done') && (
        <div className="space-y-4">
          {/* Top stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Escalões" value={`${progress.doneEscaloes}/${progress.totalEscaloes}`} sub={progress.totalEscaloes > 0 ? `${escaloesPct}%` : ''} />
            <MiniStat label="Jogadores" value={`${progress.processed}/${progress.totalPlayers}`} sub={progress.totalPlayers > 0 ? `${pct}%` : ''} />
            <MiniStat label="Tempo" value={elapsed} sub={progress.processed > 0 && phase === 'importing' ? `~${estimateRemaining()} restante` : ''} />
            <MiniStat label="Velocidade" value={progress.avgPlayerMs > 0 ? `${(progress.avgPlayerMs / 1000).toFixed(1)}s/jog` : '…'} sub={progress.processed > 0 ? `${(progress.processed / ((Date.now() - progress.startedAt) / 1000)).toFixed(1)}/s` : ''} />
          </div>

          {/* Global progress bar */}
          {progress.totalPlayers > 0 && (
            <div className="space-y-1">
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{pct}% completo</span>
                <div className="flex gap-3">
                  <span className="text-emerald-600">{progress.created} novos</span>
                  <span className="text-blue-600">{progress.updated} atualizados</span>
                  <span>{progress.unchanged} sem alt.</span>
                  {progress.errors > 0 && <span className="text-red-600">{progress.errors} erros</span>}
                </div>
              </div>
            </div>
          )}

          {/* Per-club status list */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Clubes:</p>
            <div className="space-y-1">
              {clubStatuses.map((cs, i) => (
                <ClubStatusRow key={i} cs={cs} />
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {phase === 'importing' && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={stopImport}>Parar</Button>
            )}
            {phase === 'done' && (
              <>
                <Button variant="outline" size="sm" onClick={resetAll}>Nova importação</Button>
                <Button variant="ghost" size="sm" onClick={downloadLog} className="text-muted-foreground">
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Log
                </Button>
              </>
            )}
          </div>

          {/* Live log */}
          {log.length > 0 && (
            <div className="rounded-lg border bg-muted/30 text-xs font-mono">
              <div className="flex items-center justify-between border-b px-3 py-1.5">
                <span className="text-muted-foreground">Log ({log.length})</span>
                {phase === 'done' && (
                  <button type="button" onClick={downloadLog} className="text-muted-foreground/50 hover:text-foreground">
                    <Download className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto p-2 space-y-px">
                {log.map((entry, i) => (
                  <LogLine key={i} entry={entry} />
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────── Empty state ───────────── */}
      {isQueuePhase && !configClub && queue.length === 0 && searchResults.length === 0 && !isSearching && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Pesquisa clubes na FPF para importar jogadores inscritos.</p>
          <p className="max-w-sm text-xs text-muted-foreground/60">Podes adicionar vários clubes à fila e importar tudo de uma vez.</p>
        </div>
      )}
    </div>
  );
}

/* ───────────── Mini Stat ───────────── */

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 tabular-nums">{sub}</p>}
    </div>
  );
}

/* ───────────── Club Status Row ───────────── */

const STATUS_ICONS: Record<ClubStatus['status'], React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />,
  fetching: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
  importing: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
};

function ClubStatusRow({ cs }: { cs: ClubStatus }) {
  const playerPct = cs.totalPlayers > 0 ? Math.round((cs.processedPlayers / cs.totalPlayers) * 100) : 0;

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
      {STATUS_ICONS[cs.status]}
      <span className="min-w-0 flex-1 truncate font-medium">{cs.clubName}</span>
      {cs.status === 'fetching' && (
        <span className="shrink-0 text-muted-foreground">{cs.doneEscaloes}/{cs.totalEscaloes} esc.</span>
      )}
      {(cs.status === 'importing' || cs.status === 'done') && cs.totalPlayers > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground transition-all duration-300" style={{ width: `${playerPct}%` }} />
          </div>
          <span className="w-16 text-right tabular-nums text-muted-foreground">
            {cs.processedPlayers}/{cs.totalPlayers}
          </span>
          {cs.created > 0 && <span className="text-emerald-600">+{cs.created}</span>}
          {cs.errors > 0 && <span className="text-red-600">{cs.errors}err</span>}
        </div>
      )}
      {cs.status === 'pending' && (
        <span className="shrink-0 text-muted-foreground/40">em espera</span>
      )}
    </div>
  );
}

/* ───────────── Log Line ───────────── */

const LOG_COLORS: Record<LogEntry['event'], string> = {
  info: 'text-muted-foreground',
  escalao_ok: 'text-blue-600',
  escalao_fail: 'text-red-600',
  player_ok: 'text-emerald-600',
  player_fail: 'text-red-600',
  player_slow: 'text-amber-600',
};

function LogLine({ entry }: { entry: LogEntry }) {
  const time = entry.ts.slice(11, 19);
  const color = LOG_COLORS[entry.event];
  const durationStr = entry.durationMs != null ? `${(entry.durationMs / 1000).toFixed(1)}s` : '';

  return (
    <div className="flex gap-2 leading-5">
      <span className="shrink-0 text-muted-foreground/60">{time}</span>
      <span className={`min-w-0 flex-1 break-words ${color}`}>{entry.message}</span>
      {durationStr && (
        <span className={`shrink-0 tabular-nums ${entry.durationMs! > SLOW_THRESHOLD_MS ? 'text-amber-600' : 'text-muted-foreground/60'}`}>
          {durationStr}
        </span>
      )}
    </div>
  );
}
