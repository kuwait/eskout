// src/app/master/competicoes/[id]/ImportClubsDialog.tsx
// Dialog for bulk-importing all competition clubs' players from FPF
// Searches each team in FPF, fetches registered players for the competition's escalão, imports them
// RELEVANT FILES: src/actions/scraping/fpf-club-import.ts, src/actions/scraping/fpf-competitions/stats.ts

'use client';

import { useState, useCallback, useRef } from 'react';
import { Download, Loader2, CheckCircle, XCircle, AlertTriangle, X, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCompetitionTeams } from '@/actions/scraping/fpf-competitions/stats';
import {
  searchFpfClubs, getFpfClubPlayers, importFpfPlayerBatch,
  type FpfClubPlayer,
} from '@/actions/scraping/fpf-club-import';
import { decodeHtmlEntities } from '@/actions/scraping/helpers';

/* ───────────── Escalão → FPF classId ───────────── */

const ESCALAO_CLASS_MAP: Record<string, number> = {
  'Sub-7': 10,
  'Sub-9': 9,
  'Sub-11': 8,
  'Sub-13': 6,
  'Sub-15': 5,
  'Sub-17': 4,
  'Sub-19': 3,
  'Sénior': 2,
};

/* ───────────── Types ───────────── */

interface TeamStatus {
  name: string;
  status: 'pending' | 'searching' | 'fetching' | 'importing' | 'done' | 'error' | 'skipped';
  fpfClubId?: number;
  fpfClubName?: string;
  playersFound?: number;
  imported?: number;
  updated?: number;
  error?: string;
}

/* ───────────── Component ───────────── */

export function ImportClubsButton({ competitionId, escalao }: { competitionId: number; escalao: string | null }) {
  const [open, setOpen] = useState(false);

  if (!escalao || !ESCALAO_CLASS_MAP[escalao]) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-xs gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Importar Clubes</span>
        <span className="sm:hidden">Import</span>
      </Button>

      {open && (
        <ImportClubsDialog
          competitionId={competitionId}
          escalao={escalao}
          classId={ESCALAO_CLASS_MAP[escalao]}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ───────────── Dialog ───────────── */

function ImportClubsDialog({
  competitionId, escalao, classId, onClose,
}: {
  competitionId: number;
  escalao: string;
  classId: number;
  onClose: () => void;
}) {
  const [teams, setTeams] = useState<TeamStatus[]>([]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [totalImported, setTotalImported] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const stopRef = useRef(false);

  const updateTeam = useCallback((name: string, update: Partial<TeamStatus>) => {
    setTeams((prev) => prev.map((t) => t.name === name ? { ...t, ...update } : t));
  }, []);

  const startImport = useCallback(async () => {
    setPhase('running');
    stopRef.current = false;

    // Step 1: Get all teams from competition
    const teamsRes = await getCompetitionTeams(competitionId);
    if (!teamsRes.success || !teamsRes.data?.length) {
      setPhase('done');
      return;
    }

    const teamNames = teamsRes.data;
    setTeams(teamNames.map((name) => ({ name, status: 'pending' })));

    let imported = 0;
    let updated = 0;
    let errors = 0;

    for (const teamName of teamNames) {
      if (stopRef.current) break;

      const decoded = decodeHtmlEntities(teamName);
      // Clean team name for search: remove "B"/"C" suffixes, "Sad", quotes
      const searchName = decoded
        .replace(/\s*"[A-Za-z]"\s*/g, ' ')
        .replace(/\s*-\s*Sad\s*/gi, '')
        .replace(/,\s*Sad\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Step 2: Search FPF for this club
      updateTeam(teamName, { status: 'searching' });
      const searchRes = await searchFpfClubs(searchName);

      if (!searchRes.success || !searchRes.data?.length) {
        // Try shorter name (first 2 words)
        const shortName = searchName.split(' ').slice(0, 2).join(' ');
        const retryRes = await searchFpfClubs(shortName);
        if (!retryRes.success || !retryRes.data?.length) {
          updateTeam(teamName, { status: 'error', error: 'Clube não encontrado no FPF' });
          errors++;
          continue;
        }
        searchRes.data = retryRes.data;
      }

      // Pick the best match (first result usually correct)
      const fpfClub = searchRes.data![0];
      updateTeam(teamName, {
        status: 'fetching',
        fpfClubId: fpfClub.id,
        fpfClubName: fpfClub.name,
      });

      // Step 3: Fetch players for this club + escalão
      const playersRes = await getFpfClubPlayers(fpfClub.id, classId);
      if (!playersRes.success || !playersRes.data?.length) {
        updateTeam(teamName, {
          status: playersRes.data?.length === 0 ? 'skipped' : 'error',
          playersFound: 0,
          error: playersRes.data?.length === 0 ? `Sem jogadores ${escalao}` : playersRes.error,
        });
        if (!playersRes.success) errors++;
        continue;
      }

      const players: FpfClubPlayer[] = playersRes.data;
      updateTeam(teamName, { status: 'importing', playersFound: players.length });

      // Step 4: Import players
      if (stopRef.current) break;
      const { results } = await importFpfPlayerBatch(players, fpfClub.name, 5);

      let teamImported = 0;
      let teamUpdated = 0;
      for (const r of results) {
        if (r.success && r.data) {
          if (r.data.action === 'created') teamImported++;
          if (r.data.action === 'updated') teamUpdated++;
        }
      }

      imported += teamImported;
      updated += teamUpdated;
      setTotalImported(imported);
      setTotalUpdated(updated);

      updateTeam(teamName, {
        status: 'done',
        imported: teamImported,
        updated: teamUpdated,
      });

      // Small delay between clubs to avoid FPF throttling
      await new Promise((r) => setTimeout(r, 2000));
    }

    setTotalErrors(errors);
    setPhase('done');
  }, [competitionId, classId, escalao, updateTeam]);

  // Retry state: which team is being manually searched
  const [retryTeam, setRetryTeam] = useState<string | null>(null);
  const [retryQuery, setRetryQuery] = useState('');
  const [retryResults, setRetryResults] = useState<{ id: number; name: string }[]>([]);
  const [retrySearching, setRetrySearching] = useState(false);

  const handleRetrySearch = useCallback(async () => {
    if (retryQuery.trim().length < 2) return;
    setRetrySearching(true);
    const res = await searchFpfClubs(retryQuery.trim());
    setRetryResults(res.success && res.data ? res.data.map((c) => ({ id: c.id, name: c.name })) : []);
    setRetrySearching(false);
  }, [retryQuery]);

  const handleRetrySelect = useCallback(async (teamName: string, fpfClubId: number, fpfClubName: string) => {
    setRetryTeam(null);
    setRetryQuery('');
    setRetryResults([]);

    updateTeam(teamName, { status: 'fetching', fpfClubId, fpfClubName });

    const playersRes = await getFpfClubPlayers(fpfClubId, classId);
    if (!playersRes.success || !playersRes.data?.length) {
      updateTeam(teamName, {
        status: playersRes.data?.length === 0 ? 'skipped' : 'error',
        playersFound: 0,
        error: playersRes.data?.length === 0 ? `Sem jogadores ${escalao}` : playersRes.error,
      });
      return;
    }

    updateTeam(teamName, { status: 'importing', playersFound: playersRes.data.length });

    const { results } = await importFpfPlayerBatch(playersRes.data, fpfClubName, 5);
    let teamImported = 0;
    let teamUpdated = 0;
    for (const r of results) {
      if (r.success && r.data) {
        if (r.data.action === 'created') teamImported++;
        if (r.data.action === 'updated') teamUpdated++;
      }
    }

    setTotalImported((prev) => prev + teamImported);
    setTotalUpdated((prev) => prev + teamUpdated);
    updateTeam(teamName, { status: 'done', imported: teamImported, updated: teamUpdated });
  }, [classId, escalao, updateTeam]);

  const doneCount = teams.filter((t) => t.status === 'done' || t.status === 'error' || t.status === 'skipped').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[70vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-sm font-bold">Importar Clubes da Competição</h2>
            <p className="text-xs text-muted-foreground">Escalão: {escalao} — {teams.length || '?'} equipas</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress */}
        {phase !== 'idle' && teams.length > 0 && (
          <div className="px-4 py-2 border-b bg-muted/30 text-xs space-y-1">
            <div className="flex justify-between">
              <span>{doneCount}/{teams.length} clubes</span>
              <span className="text-green-600">+{totalImported} novos</span>
              {totalUpdated > 0 && <span className="text-blue-600">{totalUpdated} atualizados</span>}
              {totalErrors > 0 && <span className="text-red-600">{totalErrors} erros</span>}
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all"
                style={{ width: `${teams.length > 0 ? (doneCount / teams.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Team list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {phase === 'idle' && (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                Importar jogadores de todos os clubes desta competição ({escalao}) automaticamente via FPF.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Pesquisa clube → busca jogadores registados → importa novos / atualiza existentes.
              </p>
            </div>
          )}

          {teams.map((t) => (
            <div key={t.name} className="text-xs py-1">
              <div className="flex items-center gap-2">
                {/* Status icon */}
                {t.status === 'pending' && <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/30" />}
                {(t.status === 'searching' || t.status === 'fetching' || t.status === 'importing') && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
                )}
                {t.status === 'done' && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />}
                {t.status === 'error' && (
                  <button type="button" onClick={() => { setRetryTeam(t.name); setRetryQuery(decodeHtmlEntities(t.name)); setRetryResults([]); }} title="Pesquisar manualmente">
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500 hover:text-red-700" />
                  </button>
                )}
                {t.status === 'skipped' && (
                  <button type="button" onClick={() => { setRetryTeam(t.name); setRetryQuery(decodeHtmlEntities(t.name)); setRetryResults([]); }} title="Pesquisar manualmente">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 hover:text-amber-700" />
                  </button>
                )}

                {/* Team name */}
                <span className={`flex-1 truncate ${t.status === 'done' ? 'text-muted-foreground' : ''}`}>
                  {decodeHtmlEntities(t.name)}
                  {t.fpfClubName && t.fpfClubName !== decodeHtmlEntities(t.name) && (
                    <span className="text-muted-foreground"> → {t.fpfClubName}</span>
                  )}
                </span>

                {/* Status detail */}
                <span className="text-muted-foreground shrink-0">
                  {t.status === 'searching' && 'a pesquisar…'}
                  {t.status === 'fetching' && 'a buscar jogadores…'}
                  {t.status === 'importing' && `a importar ${t.playersFound}…`}
                  {t.status === 'done' && (
                    <span>
                      {t.playersFound} jog.
                      {(t.imported ?? 0) > 0 && <span className="text-green-600 ml-1">+{t.imported}</span>}
                      {(t.updated ?? 0) > 0 && <span className="text-blue-600 ml-1">↑{t.updated}</span>}
                    </span>
                  )}
                  {t.status === 'error' && (
                    <button type="button" onClick={() => { setRetryTeam(t.name); setRetryQuery(decodeHtmlEntities(t.name)); setRetryResults([]); }}
                      className="text-red-500 hover:underline flex items-center gap-1">
                      {t.error} <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                  {t.status === 'skipped' && (
                    <button type="button" onClick={() => { setRetryTeam(t.name); setRetryQuery(decodeHtmlEntities(t.name)); setRetryResults([]); }}
                      className="text-amber-500 hover:underline flex items-center gap-1">
                      {t.error} <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </div>

              {/* Inline retry search */}
              {retryTeam === t.name && (
                <div className="ml-6 mt-1.5 space-y-1.5 p-2 rounded border bg-muted/30">
                  <div className="flex gap-1.5">
                    <Input
                      value={retryQuery}
                      onChange={(e) => setRetryQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRetrySearch()}
                      placeholder="Pesquisar clube no FPF…"
                      className="h-7 text-xs"
                      autoFocus
                    />
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={handleRetrySearch} disabled={retrySearching || retryQuery.trim().length < 2}>
                      {retrySearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setRetryTeam(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  {retryResults.length > 0 && (
                    <div className="space-y-0.5">
                      {retryResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleRetrySelect(t.name, r.id, r.name)}
                          className="w-full text-left px-2 py-1 rounded hover:bg-muted text-xs truncate"
                        >
                          {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {retryResults.length === 0 && !retrySearching && retryQuery.length >= 2 && (
                    <p className="text-[10px] text-muted-foreground italic px-1">Pesquise e selecione o clube correcto</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          {phase === 'running' && (
            <Button variant="outline" size="sm" onClick={() => { stopRef.current = true; }}>
              Parar
            </Button>
          )}
          {phase === 'idle' && (
            <Button size="sm" onClick={startImport} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Iniciar Importação
            </Button>
          )}
          {phase === 'done' && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Fechar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
