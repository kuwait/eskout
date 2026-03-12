// src/app/admin/dados/FpfClubImportTab.tsx
// Client component for importing registered players from FPF club pages
// Search club → select escalões → import players 1 by 1 with FPF scraping
// RELEVANT FILES: src/actions/scraping/fpf-club-import.ts, src/app/admin/dados/page.tsx

'use client';

import { useState, useCallback, useRef } from 'react';
import { Search, X, Loader2, CheckCircle2, SkipForward, AlertCircle, Building2, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  searchFpfClubs,
  getFpfClubPlayers,
  importFpfPlayer,
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

/* ───────────── Component ───────────── */

type ImportPhase = 'search' | 'config' | 'importing' | 'done';

interface ImportProgress {
  total: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  currentName: string;
  lastError: string | null;
}

export function FpfClubImportTab() {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FpfClubSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  // Selected club + escalões
  const [selectedClub, setSelectedClub] = useState<FpfClubSearchResult | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<Set<number>>(() => new Set(FPF_CLASSES.map((c) => c.classId)));

  // Import state
  const [phase, setPhase] = useState<ImportPhase>('search');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(''); // Live status during escalão fetch
  const [progress, setProgress] = useState<ImportProgress>({ total: 0, processed: 0, created: 0, updated: 0, unchanged: 0, errors: 0, currentName: '', lastError: null });
  const stopRef = useRef(false);

  /* ───────────── Search ───────────── */

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchResults([]);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.trim().length < 2) return;

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      const res = await searchFpfClubs(query);
      setIsSearching(false);
      if (res.success && res.data) setSearchResults(res.data);
    }, 400);
  }, []);

  function selectClub(club: FpfClubSearchResult) {
    setSelectedClub(club);
    setSearchResults([]);
    setSearchQuery(club.name);
    setPhase('config');
  }

  function resetSearch() {
    setSelectedClub(null);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedClasses(new Set());
    setPhase('search');
    setProgress({ total: 0, processed: 0, created: 0, updated: 0, unchanged: 0, errors: 0, currentName: '', lastError: null });
    stopRef.current = false;
  }

  function toggleClass(classId: number) {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  /* ───────────── Import ───────────── */

  async function startImport() {
    if (!selectedClub || selectedClasses.size === 0) return;
    stopRef.current = false;
    setPhase('importing');
    setIsFetching(true);

    // Fetch players for all selected escalões
    const allPlayers: FpfClubPlayer[] = [];
    const seenUrls = new Set<string>();

    const sortedClasses = Array.from(selectedClasses).sort((a, b) => a - b);
    for (let ci = 0; ci < sortedClasses.length; ci++) {
      if (stopRef.current) break;
      const classId = sortedClasses[ci];
      const classLabel = FPF_CLASSES.find((c) => c.classId === classId)?.label ?? `#${classId}`;
      setFetchStatus(`A buscar ${classLabel} (${ci + 1}/${sortedClasses.length})… ${allPlayers.length} jogadores encontrados`);

      const res = await getFpfClubPlayers(selectedClub.id, classId);
      if (res.success && res.data) {
        for (const p of res.data) {
          if (!seenUrls.has(p.url)) {
            seenUrls.add(p.url);
            allPlayers.push(p);
          }
        }
      }
      if (!stopRef.current) await humanDelay(2000, 3000);
    }

    setFetchStatus('');
    setIsFetching(false);
    setProgress({ total: allPlayers.length, processed: 0, created: 0, updated: 0, unchanged: 0, errors: 0, currentName: '', lastError: null });

    // Import 1 by 1
    for (let i = 0; i < allPlayers.length; i++) {
      if (stopRef.current) break;

      const player = allPlayers[i];
      setProgress((prev) => ({ ...prev, currentName: player.name, processed: i }));

      const res = await importFpfPlayer(player, selectedClub.name);

      const action = res.success ? res.data?.action : null;
      const errMsg = !res.success ? res.error ?? 'Erro desconhecido' : null;
      if (errMsg) console.error('[FPF Import]', player.name, errMsg);
      setProgress((prev) => ({
        ...prev,
        processed: i + 1,
        created: prev.created + (action === 'created' ? 1 : 0),
        updated: prev.updated + (action === 'updated' ? 1 : 0),
        unchanged: prev.unchanged + (action === 'unchanged' ? 1 : 0),
        errors: prev.errors + (errMsg ? 1 : 0),
        lastError: errMsg ?? prev.lastError,
      }));

      // Delay between individual player imports (FPF profile scrape per player)
      if (i < allPlayers.length - 1 && !stopRef.current) {
        await humanDelay(2000, 4000);
      }
    }

    // Revalidate all affected pages
    await finishFpfImport();
    setPhase('done');
  }

  function stopImport() {
    stopRef.current = true;
    setPhase('done');
  }

  /* ───────────── Render ───────────── */

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
        <Input
          placeholder="Pesquisar clube na FPF..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          disabled={phase === 'importing'}
          className="h-10 pl-9 pr-8 text-sm"
        />
        {(searchQuery || selectedClub) && phase !== 'importing' && (
          <button
            type="button"
            onClick={resetSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/50 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {isSearching && (
          <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {/* Search results dropdown */}
        {searchResults.length > 0 && !selectedClub && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-md">
            {searchResults.map((club) => (
              <button
                key={club.id}
                type="button"
                onClick={() => selectClub(club)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{club.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected club + escalão selection */}
      {selectedClub && phase === 'config' && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">{selectedClub.name}</h3>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Escalões a importar:</p>
              <button
                type="button"
                onClick={() => {
                  const allSelected = selectedClasses.size === FPF_CLASSES.length;
                  setSelectedClasses(allSelected ? new Set() : new Set(FPF_CLASSES.map((c) => c.classId)));
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {selectedClasses.size === FPF_CLASSES.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FPF_CLASSES.map((cls) => (
                <label
                  key={cls.classId}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    selectedClasses.has(cls.classId) ? 'border-foreground bg-foreground/5' : 'border-border'
                  }`}
                >
                  <Checkbox
                    checked={selectedClasses.has(cls.classId)}
                    onCheckedChange={() => toggleClass(cls.classId)}
                  />
                  {cls.label}
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={startImport}
            disabled={selectedClasses.size === 0}
            className="w-full sm:w-auto"
          >
            Importar jogadores ({selectedClasses.size} {selectedClasses.size === 1 ? 'escalão' : 'escalões'})
          </Button>
        </div>
      )}

      {/* Fetching escalões — live progress */}
      {isFetching && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {fetchStatus || 'A buscar jogadores inscritos na FPF…'}
        </div>
      )}

      {/* Import progress */}
      {phase === 'importing' && !isFetching && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              A importar: {progress.processed} de {progress.total}
            </p>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={stopImport}>
              Parar
            </Button>
          </div>

          {/* Progress bar */}
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Current player */}
          {progress.currentName && (
            <p className="truncate text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              {progress.currentName}
            </p>
          )}

          {/* Counters */}
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-600">{progress.created} novos</span>
            <span className="text-blue-600">{progress.updated} atualizados</span>
            <span className="text-muted-foreground">{progress.unchanged} sem alterações</span>
            {progress.errors > 0 && <span className="text-red-500">{progress.errors} erros</span>}
          </div>
          {progress.lastError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600">
              Último erro: {progress.lastError}
            </p>
          )}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <h3 className="font-semibold">Importação concluída</h3>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} label="Novos" value={progress.created} />
            <StatCard icon={<RefreshCw className="h-4 w-4 text-blue-500" />} label="Atualizados" value={progress.updated} />
            <StatCard icon={<SkipForward className="h-4 w-4 text-muted-foreground" />} label="Sem alterações" value={progress.unchanged} />
            <StatCard icon={<AlertCircle className="h-4 w-4 text-red-500" />} label="Erros" value={progress.errors} />
          </div>

          {progress.lastError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600">
              Último erro: {progress.lastError}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={resetSearch}>
            Nova importação
          </Button>
        </div>
      )}

      {/* Empty state */}
      {phase === 'search' && !selectedClub && searchResults.length === 0 && !isSearching && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Pesquisa um clube na FPF para importar jogadores inscritos.
          </p>
          <p className="max-w-sm text-xs text-muted-foreground/60">
            Seleciona os escalões a importar. Jogadores já existentes são ignorados automaticamente.
          </p>
        </div>
      )}
    </div>
  );
}

/* ───────────── Stat Card ───────────── */

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      {icon}
      <div>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
