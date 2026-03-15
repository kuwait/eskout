// src/app/master/competicoes/[id]/CompetitionStatsClient.tsx
// Tab-based competition stats dashboard — Playing Up, scorers, minutes, cards, standings, results
// Fetches data lazily per tab (server actions) to avoid loading everything up front
// RELEVANT FILES: src/actions/scraping/fpf-competitions/stats.ts, src/actions/scraping/fpf-competitions/playing-up.ts

'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, TrendingUp, Clock, AlertTriangle, Shield, Search, X,
  Loader2, Goal, CalendarDays, Unlink, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  getTopScorers, getMostMinutes, getMostCards, getTeamStats,
  getCompetitionMatches,
  type PlayerStatRow, type SeriesClassification,
} from '@/actions/scraping/fpf-competitions/stats';
import { getPlayingUpPlayers, type PlayingUpPlayer } from '@/actions/scraping/fpf-competitions/playing-up';
import {
  getUnlinkedWithSuggestions, bulkLinkPlayers, searchEskoutPlayers,
  type UnlinkedWithSuggestions, type BulkLinkEntry, type PlayerSuggestion,
} from '@/actions/scraping/fpf-competitions/link-players';
import { decodeHtmlEntities } from '@/actions/scraping/helpers';
import type { ActionResponse, FpfCompetitionRow, FpfMatchRow } from '@/lib/types';
import { ImportClubsButton } from './ImportClubsDialog';

/* ───────────── Types ───────────── */

type TabId = 'playing-up' | 'scorers' | 'minutes' | 'cards' | 'teams' | 'results' | 'unlinked';

interface TabDef {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'playing-up', label: 'Jogar Acima', shortLabel: 'Acima', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'scorers', label: 'Marcadores', shortLabel: 'Golos', icon: <Goal className="h-3.5 w-3.5" /> },
  { id: 'minutes', label: 'Minutos', shortLabel: 'Min', icon: <Clock className="h-3.5 w-3.5" /> },
  { id: 'cards', label: 'Cartões', shortLabel: 'Cartões', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { id: 'teams', label: 'Classificação', shortLabel: 'Class.', icon: <Shield className="h-3.5 w-3.5" /> },
  { id: 'results', label: 'Resultados', shortLabel: 'Result.', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { id: 'unlinked', label: 'Links Pendentes', shortLabel: 'Links', icon: <Unlink className="h-3.5 w-3.5" /> },
];

/* ───────────── Fetch Hook ───────────── */

/** Generic hook for lazy-fetching data via server actions — avoids setState-in-effect lint errors.
 *  `fetcher` must be a stable reference (wrap with useCallback). */
function useServerAction<T>(fetcher: () => Promise<ActionResponse<T>>) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetcher().then((res) => {
      if (cancelled) return;
      if (res.success) {
        setState({ data: res.data ?? null, error: null, loading: false });
      } else {
        setState({ data: null, error: res.error ?? 'Erro', loading: false });
      }
    });
    return () => { cancelled = true; };
  }, [fetcher]);

  return state;
}

/* ───────────── Component ───────────── */

export function CompetitionStatsClient({ competition }: { competition: FpfCompetitionRow }) {
  const [activeTab, setActiveTab] = useState<TabId>(competition.escalao ? 'playing-up' : 'scorers');
  // Hide "Links Pendentes" tab when there are 0 unlinked players (null = still loading)
  const [unlinkedCount, setUnlinkedCount] = useState<number | null>(null);

  // Filter tabs: hide playing-up if no escalao, hide unlinked if count is 0
  const visibleTabs = useMemo(() => {
    let tabs = TABS;
    if (!competition.escalao) tabs = tabs.filter((t) => t.id !== 'playing-up');
    if (unlinkedCount === 0) tabs = tabs.filter((t) => t.id !== 'unlinked');
    return tabs;
  }, [competition.escalao, unlinkedCount]);

  // Callback to update unlinked count — also switches tab away if count drops to 0
  const handleUnlinkedCountChange = useCallback((count: number) => {
    setUnlinkedCount(count);
    if (count === 0) setActiveTab((prev) => prev === 'unlinked' ? (competition.escalao ? 'playing-up' : 'scorers') : prev);
  }, [competition.escalao]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/master/competicoes" className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-bold lg:text-xl">{competition.name}</h1>
            <ImportClubsButton competitionId={competition.id} escalao={competition.escalao} />
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{competition.season}</span>
            {competition.association_name && <span>{competition.association_name}</span>}
            {competition.escalao && <span className="font-medium text-purple-600">{competition.escalao}</span>}
            <span>{competition.scraped_matches} jogos</span>
          </div>
        </div>
      </div>

      {/* Tab bar — scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex gap-1 rounded-lg border bg-muted/50 p-1 min-w-max">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'playing-up' && <PlayingUpTab competitionId={competition.id} />}
        {activeTab === 'scorers' && <TopScorersTab competitionId={competition.id} />}
        {activeTab === 'minutes' && <MostMinutesTab competitionId={competition.id} />}
        {activeTab === 'cards' && <CardsTab competitionId={competition.id} />}
        {activeTab === 'teams' && <TeamStatsTab competitionId={competition.id} />}
        {activeTab === 'results' && <MatchesTab competitionId={competition.id} mode="results" />}
        {activeTab === 'unlinked' && <UnlinkedPlayersTab competitionId={competition.id} onCountChange={handleUnlinkedCountChange} />}
      </div>
    </div>
  );
}

/* ───────────── Loading State ───────────── */

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      A carregar&hellip;
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">{message}</div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-red-600">{message}</div>
  );
}

/* ───────────── External Links ───────────── */

/** Small FPF/ZZ favicon links before player name — disabled (greyed out) when no link */
function ExternalLinks({ fpfLink, zerozeroLink }: { fpfLink?: string | null; zerozeroLink?: string | null }) {
  return (
    <span className="inline-flex gap-0.5 shrink-0">
      {fpfLink && (
        <a href={fpfLink} target="_blank" rel="noopener noreferrer" className="opacity-60 hover:opacity-100 transition-opacity" title="Perfil FPF" onClick={(e) => e.stopPropagation()}>
          <img src="/icons/fpf.png" alt="FPF" className="h-3 w-3" />
        </a>
      )}
      {zerozeroLink ? (
        <a href={zerozeroLink} target="_blank" rel="noopener noreferrer" className="opacity-60 hover:opacity-100 transition-opacity" title="Perfil ZeroZero" onClick={(e) => e.stopPropagation()}>
          <img src="/icons/zerozero.png" alt="ZZ" className="h-3 w-3" />
        </a>
      ) : (
        <span className="opacity-30" title="Sem perfil ZeroZero"><img src="/icons/zerozero-disabled.png" alt="" className="h-3 w-3" /></span>
      )}
    </span>
  );
}

/* ───────────── Club Change Note ───────────── */

/** Shows a small note when the player's current club differs from the competition team */
function ClubChangeNote({ teamName, eskoutClub }: { teamName: string; eskoutClub: string | null | undefined }) {
  if (!eskoutClub) return null;
  // Normalize: strip suffixes ("B"/"C"), common words (FC, SC, SAD, Sport, Club, etc.), accents, punctuation
  const normalize = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*"[a-z]"\s*/g, ' ') // strip team letter suffixes like "B", "C"
    .replace(/\b(fc|f\.c\.|sc|s\.c\.|cf|cd|ud|ad|gd|gdrc|ac|cs|us|sr|sl|sad|sport|sporting|club|clube|futebol|associacao|associa[cç][aã]o|uniao|uni[aã]o|grupo|desportivo|recreativo|academico|atletico)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const a = normalize(teamName);
  const b = normalize(eskoutClub);
  if (!a || !b) return null;
  if (a === b || a.includes(b) || b.includes(a)) return null;
  return <p className="text-[10px] text-blue-500">atual: {eskoutClub}</p>;
}

/* ───────────── Playing Up Tab ───────────── */

function PlayingUpTab({ competitionId }: { competitionId: number }) {
  const { data, error, loading } = useServerAction<PlayingUpPlayer[]>(
    useCallback(() => getPlayingUpPlayers(competitionId), [competitionId]),
  );
  // Track expanded items (all start collapsed)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  /* Group players by phase → series → team */
  const phaseGroups = useMemo(() => {
    if (!data?.length) return [];
    // Group by phase first
    const byPhase = new Map<string, PlayingUpPlayer[]>();
    for (const p of data) {
      const phase = p.phaseName || 'Geral';
      if (!byPhase.has(phase)) byPhase.set(phase, []);
      byPhase.get(phase)!.push(p);
    }
    // For each phase, group by series, then team
    return [...byPhase.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([phase, phasePlayers]) => {
        const bySeries = new Map<string, PlayingUpPlayer[]>();
        for (const p of phasePlayers) {
          const series = p.seriesName || 'Geral';
          if (!bySeries.has(series)) bySeries.set(series, []);
          bySeries.get(series)!.push(p);
        }
        const seriesGroups = [...bySeries.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([series, seriesPlayers]) => {
            const byTeam = new Map<string, PlayingUpPlayer[]>();
            for (const p of seriesPlayers) {
              const team = p.teamName;
              if (!byTeam.has(team)) byTeam.set(team, []);
              byTeam.get(team)!.push(p);
            }
            const teams = [...byTeam.entries()]
              .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
              .map(([team, tp]) => ({
                team: decodeHtmlEntities(team),
                rawTeam: team,
                players: tp.sort((a, b) => b.totalMinutes - a.totalMinutes),
              }));
            return { series, teams, totalPlayers: seriesPlayers.length };
          });
        return { phase, seriesGroups, totalPlayers: phasePlayers.length };
      });
  }, [data]);

  const hasPhases = phaseGroups.length > 1;
  const hasSeries = phaseGroups.some((pg) => pg.seriesGroups.length > 1 || (pg.seriesGroups.length === 1 && pg.seriesGroups[0].series !== 'Geral'));
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data?.length) return <EmptyState message="Nenhum jogador a jogar acima do escalão detetado." />;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3">
        {data.length} jogadores a jogar acima do seu escalão
        {hasPhases && ` — ${phaseGroups.length} fases`}
      </p>

      {phaseGroups.map(({ phase, seriesGroups, totalPlayers: phaseTotalPlayers }) => {
        const phaseKey = `phase:${phase}`;
        const phaseOpen = !hasPhases || expanded.has(phaseKey);
        const showSeriesHeaders = seriesGroups.length > 1 || (seriesGroups.length === 1 && seriesGroups[0].series !== 'Geral');

        return (
          <div key={phase} className="space-y-1">
            {/* Phase header (only if multiple phases) */}
            {hasPhases && (
              <button
                type="button"
                onClick={() => toggle(phaseKey)}
                className="flex items-center gap-1.5 pt-3 pb-1 border-b-2 border-foreground/20 w-full text-left"
              >
                {phaseOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <h2 className="text-sm font-bold">{phase}</h2>
                <span className="text-xs text-muted-foreground">{phaseTotalPlayers} jogadores</span>
              </button>
            )}

            {phaseOpen && seriesGroups.map(({ series, teams, totalPlayers }) => {
              const seriesKey = `series:${phase}:${series}`;
              const seriesOpen = !showSeriesHeaders || expanded.has(seriesKey);

              return (
                <div key={seriesKey} className="space-y-1">
                  {/* Series header */}
                  {showSeriesHeaders && (
                    <button
                      type="button"
                      onClick={() => toggle(seriesKey)}
                      className="flex items-center gap-1.5 pt-2 pb-1 border-b border-purple-200 w-full text-left ml-2"
                    >
                      {seriesOpen ? <ChevronDown className="h-3.5 w-3.5 text-purple-500" /> : <ChevronRight className="h-3.5 w-3.5 text-purple-500" />}
                      <span className="text-sm font-bold text-purple-700">{series}</span>
                      <span className="text-xs text-muted-foreground">{totalPlayers} jogadores em {teams.length} equipas</span>
                    </button>
                  )}

                  {/* Desktop table */}
                  {seriesOpen && (
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-3 font-medium">Jogador</th>
                          <th className="pb-2 pr-3 font-medium text-center">Ano</th>
                          <th className="pb-2 pr-3 font-medium text-center">Escalão Natural</th>
                          <th className="pb-2 pr-3 font-medium text-center">+Anos</th>
                          <th className="pb-2 pr-3 font-medium text-right">J</th>
                          <th className="pb-2 pr-3 font-medium text-right">Min</th>
                          <th className="pb-2 pr-3 font-medium text-right">G</th>
                          <th className="pb-2 font-medium text-right">AM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.map(({ team, rawTeam, players }) => {
                          const teamKey = `team:${phase}:${series}:${rawTeam}`;
                          const isOpen = expanded.has(teamKey);
                          return (
                            <Fragment key={`group-${teamKey}`}>
                              <tr className="cursor-pointer select-none hover:bg-muted/30" onClick={() => toggle(teamKey)}>
                                <td colSpan={8} className="pt-4 pb-1.5">
                                  <span className="inline-flex items-center gap-1">
                                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                    <span className="text-sm font-semibold">{team}</span>
                                    <span className="text-xs text-muted-foreground">{players.length}</span>
                                  </span>
                                </td>
                              </tr>
                              {isOpen && players.map((p, i) => (
                                <tr key={`${p.fpfPlayerId ?? p.playerName}-${i}`} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="py-1.5 pr-3">
                                    <span className="flex items-center gap-1">
                                      <ExternalLinks fpfLink={p.fpfLink} zerozeroLink={p.zerozeroLink} />
                                      <PlayerLink name={decodeHtmlEntities(p.playerName)} eskoutId={p.eskoutPlayerId} isInEskout={p.isInEskout} />
                                    </span>
                                    <ClubChangeNote teamName={p.teamName} eskoutClub={p.eskoutClub} />
                                  </td>
                                  <td className="py-1.5 pr-3 text-center">{p.birthYear}</td>
                                  <td className="py-1.5 pr-3 text-center">{p.naturalEscalao ?? '?'}</td>
                                  <td className="py-1.5 pr-3 text-center">
                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">+{p.yearsAbove}</span>
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.totalGames}</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{p.totalMinutes}&apos;</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.goals || ''}</td>
                                  <td className="py-1.5 text-right tabular-nums">{p.yellowCards || ''}</td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}

                  {/* Mobile */}
                  {seriesOpen && (
                  <div className="space-y-3 sm:hidden">
                    {teams.map(({ team, rawTeam, players }) => {
                      const teamKey = `team:${phase}:${series}:${rawTeam}`;
                      const isOpen = expanded.has(teamKey);
                      return (
                        <div key={team}>
                          <button type="button" onClick={() => toggle(teamKey)} className="flex items-center gap-1.5 mb-1.5 w-full text-left">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            <h3 className="text-sm font-semibold">{team}</h3>
                            <span className="text-[11px] text-muted-foreground">{players.length}</span>
                          </button>
                          {isOpen && (
                            <div className="space-y-2">
                              {players.map((p, i) => (
                                <div key={`${p.fpfPlayerId ?? p.playerName}-${i}`} className="rounded-lg border p-3 space-y-1">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <span className="flex items-center gap-1">
                                        <ExternalLinks fpfLink={p.fpfLink} zerozeroLink={p.zerozeroLink} />
                                        <PlayerLink name={decodeHtmlEntities(p.playerName)} eskoutId={p.eskoutPlayerId} isInEskout={p.isInEskout} />
                                      </span>
                                      <ClubChangeNote teamName={p.teamName} eskoutClub={p.eskoutClub} />
                                    </div>
                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                                      +{p.yearsAbove} {p.yearsAbove > 1 ? 'anos' : 'ano'}
                                    </span>
                                  </div>
                                  <div className="flex gap-4 text-[11px] text-muted-foreground">
                                    <span>Nasc. {p.birthYear}</span>
                                    <span>Natural: {p.naturalEscalao ?? '?'}</span>
                                  </div>
                                  <div className="flex gap-4 text-xs">
                                    <span><strong>{p.totalGames}</strong> jogos</span>
                                    <span><strong>{p.totalMinutes}&apos;</strong></span>
                                    {p.goals > 0 && <span><strong>{p.goals}</strong> golos</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Top Scorers Tab ───────────── */

function TopScorersTab({ competitionId }: { competitionId: number }) {
  const { data, error, loading } = useServerAction<PlayerStatRow[]>(
    useCallback(() => getTopScorers(competitionId), [competitionId]),
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data?.length) return <EmptyState message="Sem dados de golos." />;

  return <PlayerStatsTable data={data} highlight="goals" />;
}

/* ───────────── Most Minutes Tab ───────────── */

function MostMinutesTab({ competitionId }: { competitionId: number }) {
  const { data, error, loading } = useServerAction<PlayerStatRow[]>(
    useCallback(() => getMostMinutes(competitionId), [competitionId]),
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data?.length) return <EmptyState message="Sem dados de minutos." />;

  return <PlayerStatsTable data={data} highlight="minutes" />;
}

/* ───────────── Cards Tab ───────────── */

function CardsTab({ competitionId }: { competitionId: number }) {
  const { data, error, loading } = useServerAction<PlayerStatRow[]>(
    useCallback(() => getMostCards(competitionId), [competitionId]),
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data?.length) return <EmptyState message="Sem dados de cartões." />;

  return <PlayerStatsTable data={data} highlight="cards" />;
}

/* ───────────── Player Stats Table (shared) ───────────── */

function PlayerStatsTable({ data, highlight }: { data: PlayerStatRow[]; highlight: 'goals' | 'minutes' | 'cards' }) {
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const toggleSeries = useCallback((key: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Group by series
  const seriesGroups = useMemo(() => {
    const bySeries = new Map<string, PlayerStatRow[]>();
    for (const p of data) {
      const series = p.seriesName || 'Geral';
      if (!bySeries.has(series)) bySeries.set(series, []);
      bySeries.get(series)!.push(p);
    }
    return [...bySeries.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([series, players]) => ({ series, players }));
  }, [data]);

  const hasSeries = seriesGroups.length > 1;

  return (
    <div className="space-y-2">
      {seriesGroups.map(({ series, players }) => {
        const isOpen = !hasSeries || expandedSeries.has(series);
        return (
          <div key={series}>
            {/* Series header (only if multiple series) */}
            {hasSeries && (
              <button
                type="button"
                onClick={() => toggleSeries(series)}
                className="flex items-center gap-1.5 pt-2 pb-1 border-b border-purple-200 w-full text-left"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-purple-500" /> : <ChevronRight className="h-4 w-4 text-purple-500" />}
                <span className="text-sm font-bold text-purple-700">{series}</span>
                <span className="text-xs text-muted-foreground">{players.length} jogadores</span>
              </button>
            )}

            {isOpen && (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">#</th>
                        <th className="pb-2 pr-3 font-medium">Jogador</th>
                        <th className="pb-2 pr-3 font-medium">Equipa</th>
                        <th className="pb-2 pr-3 font-medium text-right">J</th>
                        <th className="pb-2 pr-3 font-medium text-right">T</th>
                        <th className="pb-2 pr-3 font-medium text-right">Min</th>
                        <th className="pb-2 pr-3 font-medium text-right">G</th>
                        <th className="pb-2 pr-3 font-medium text-right">GP</th>
                        <th className="pb-2 pr-3 font-medium text-right">AG</th>
                        <th className="pb-2 pr-3 font-medium text-right">AM</th>
                        <th className="pb-2 font-medium text-right">VM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((p, i) => (
                        <tr key={`${p.fpfPlayerId ?? p.playerName}-${i}`} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                          <td className="py-1.5 pr-3">
                            <PlayerLink name={decodeHtmlEntities(p.playerName)} eskoutId={p.eskoutPlayerId} />
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{decodeHtmlEntities(p.teamName)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{p.totalGames}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{p.gamesStarted}</td>
                          <td className={`py-1.5 pr-3 text-right tabular-nums ${highlight === 'minutes' ? 'font-bold' : ''}`}>
                            {p.totalMinutes}&apos;
                          </td>
                          <td className={`py-1.5 pr-3 text-right tabular-nums ${highlight === 'goals' ? 'font-bold' : ''}`}>
                            {p.goals || ''}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{p.penaltyGoals || ''}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{p.ownGoals || ''}</td>
                          <td className={`py-1.5 pr-3 text-right tabular-nums ${highlight === 'cards' ? 'font-bold text-amber-600' : ''}`}>
                            {p.yellowCards || ''}
                          </td>
                          <td className={`py-1.5 text-right tabular-nums ${highlight === 'cards' ? 'font-bold text-red-600' : ''}`}>
                            {p.redCards || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-1.5 sm:hidden">
                  {players.map((p, i) => (
                    <div key={`${p.fpfPlayerId ?? p.playerName}-${i}`} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <PlayerLink name={decodeHtmlEntities(p.playerName)} eskoutId={p.eskoutPlayerId} />
                        <p className="text-[11px] text-muted-foreground truncate">{decodeHtmlEntities(p.teamName)}</p>
                      </div>
                      <div className="flex gap-3 text-xs tabular-nums">
                        {highlight === 'goals' && <span className="font-bold">{p.goals}G</span>}
                        {highlight === 'minutes' && <span className="font-bold">{p.totalMinutes}&apos;</span>}
                        {highlight === 'cards' && (
                          <span>
                            {p.yellowCards > 0 && <span className="font-bold text-amber-600">{p.yellowCards}A</span>}
                            {p.yellowCards > 0 && p.redCards > 0 && ' '}
                            {p.redCards > 0 && <span className="font-bold text-red-600">{p.redCards}V</span>}
                          </span>
                        )}
                        <span className="text-muted-foreground">{p.totalGames}J</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span>J = Jogos</span>
        <span>T = Titular</span>
        <span>Min = Minutos</span>
        <span>G = Golos</span>
        <span>GP = Golos de Penálti</span>
        <span>AG = Autogolos</span>
        <span>AM = Amarelos</span>
        <span>VM = Vermelhos</span>
      </div>
    </div>
  );
}

/* ───────────── Team Stats / Classification Tab ───────────── */

function TeamStatsTab({ competitionId }: { competitionId: number }) {
  const { data, error, loading } = useServerAction<SeriesClassification[]>(
    useCallback(() => getTeamStats(competitionId), [competitionId]),
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data?.length) return <EmptyState message="Sem dados de classificação." />;

  // If only one series ("Geral"), show it without header
  const showSeriesHeaders = data.length > 1 || data[0].seriesName !== 'Geral';

  // Use grid for 2-3 series side-by-side on desktop, stack on mobile
  const useGrid = data.length >= 2 && data.length <= 4;

  return (
    <div className="space-y-6">
      <div className={useGrid ? 'grid gap-6 lg:grid-cols-2' : 'space-y-6'}>
        {data.map((series) => (
          <div key={series.seriesName}>
            {showSeriesHeaders && (
              <h3 className="mb-2 text-sm font-bold">{series.seriesName}</h3>
            )}
            <ClassificationTable teams={series.teams} />
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span>J = Jogos</span>
        <span>V = Vitórias</span>
        <span>E = Empates</span>
        <span>D = Derrotas</span>
        <span>GM = Golos Marcados</span>
        <span>GS = Golos Sofridos</span>
        <span>DG = Diferença de Golos</span>
        <span>Pts = Pontos</span>
      </div>
    </div>
  );
}

/** Reusable classification table for a single series */
function ClassificationTable({ teams }: { teams: import('@/actions/scraping/fpf-competitions/stats').TeamStatRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-2 font-medium">#</th>
            <th className="pb-2 pr-3 font-medium">Equipa</th>
            <th className="pb-2 pr-2 font-medium text-center">J</th>
            <th className="pb-2 pr-2 font-medium text-center">V</th>
            <th className="pb-2 pr-2 font-medium text-center">E</th>
            <th className="pb-2 pr-2 font-medium text-center">D</th>
            <th className="pb-2 pr-2 font-medium text-center">GM</th>
            <th className="pb-2 pr-2 font-medium text-center">GS</th>
            <th className="pb-2 pr-2 font-medium text-center">DG</th>
            <th className="pb-2 font-medium text-center">Pts</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.teamName} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
              <td className="py-1.5 pr-3 font-medium max-w-[180px] truncate">{decodeHtmlEntities(t.teamName)}</td>
              <td className="py-1.5 pr-2 text-center tabular-nums">{t.played}</td>
              <td className="py-1.5 pr-2 text-center tabular-nums">{t.won}</td>
              <td className="py-1.5 pr-2 text-center tabular-nums">{t.drawn}</td>
              <td className="py-1.5 pr-2 text-center tabular-nums">{t.lost}</td>
              <td className="py-1.5 pr-2 text-center tabular-nums">{t.goalsFor}</td>
              <td className="py-1.5 pr-2 text-center tabular-nums">{t.goalsAgainst}</td>
              <td className="py-1.5 pr-2 text-center tabular-nums">{t.goalDiff > 0 ? `+${t.goalDiff}` : t.goalDiff}</td>
              <td className="py-1.5 text-center tabular-nums font-bold">{t.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────── Matches Tab (Results / Upcoming) ───────────── */

/** Extract jornada number from fixture name like "Jornada 12" → 12 */
function jornadaNum(fixtureName: string): number {
  const m = fixtureName.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Build ordered series → jornadas structure from flat match data.
 *  Series sorted by first fixture_id (parse order). Jornadas sorted numerically. */
function buildSeriesStructure(data: FpfMatchRow[], reverseJornadas: boolean) {
  // Group by series, tracking min fixture_id for ordering
  const seriesMap = new Map<string, { minFixtureId: number; fixtures: Map<string, FpfMatchRow[]> }>();
  for (const m of data) {
    const series = m.series_name || 'Geral';
    const fixture = m.fixture_name ?? 'Sem jornada';
    if (!seriesMap.has(series)) seriesMap.set(series, { minFixtureId: Infinity, fixtures: new Map() });
    const entry = seriesMap.get(series)!;
    entry.minFixtureId = Math.min(entry.minFixtureId, m.fpf_fixture_id);
    if (!entry.fixtures.has(fixture)) entry.fixtures.set(fixture, []);
    entry.fixtures.get(fixture)!.push(m);
  }

  // Rename technical "SerieId_XXXXX" keys
  const techEntries = Array.from(seriesMap.entries())
    .filter(([k]) => /^SerieId_\d+$/i.test(k))
    .sort(([, a], [, b]) => a.minFixtureId - b.minFixtureId);
  for (let i = 0; i < techEntries.length; i++) {
    const [key, val] = techEntries[i];
    seriesMap.delete(key);
    seriesMap.set(`Série ${i + 1}`, val);
  }

  // Sort series by first fixture_id (parse order)
  const sortedSeries = Array.from(seriesMap.entries())
    .sort(([, a], [, b]) => a.minFixtureId - b.minFixtureId);

  // Sort jornadas within each series
  return sortedSeries.map(([name, { fixtures }]) => {
    const sortedFixtures = Array.from(fixtures.entries())
      .sort(([a], [b]) => {
        const diff = jornadaNum(a) - jornadaNum(b);
        return reverseJornadas ? -diff : diff;
      });
    return { name, fixtures: sortedFixtures };
  });
}

function MatchesTab({ competitionId, mode }: { competitionId: number; mode: 'results' | 'upcoming' }) {
  const { data: rawData, error, loading } = useServerAction<FpfMatchRow[]>(
    useCallback(() => getCompetitionMatches(competitionId), [competitionId]),
  );

  // Track which jornadas are expanded (by "series::fixture" key)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const isResults = mode === 'results';

  // Filter by mode
  const now = new Date().toISOString().slice(0, 10);
  const data = (rawData ?? []).filter((m) => {
    if (isResults) return m.home_score != null && m.away_score != null;
    return m.home_score == null && m.away_score == null && (!m.match_date || m.match_date >= now);
  });

  // Build structure: series sorted by parse order, jornadas by number
  const series = data.length > 0 ? buildSeriesStructure(data, isResults) : [];

  // Auto-expand latest 2 jornadas per series on first load
  useEffect(() => {
    if (series.length === 0) return;
    const autoExpand = new Set<string>();
    for (const s of series) {
      for (const [fixture] of s.fixtures.slice(0, 2)) {
        autoExpand.add(`${s.name}::${fixture}`);
      }
    }
    setExpanded(autoExpand);
    // Only run once when data arrives — rawData identity changes once (null → data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData == null]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data.length) return <EmptyState message={isResults ? 'Sem resultados.' : 'Sem jogos futuros.'} />;

  const showSeriesHeaders = series.length > 1 || (series.length === 1 && series[0].name !== 'Geral');
  const toggleJornada = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Grid layout for 2 series side-by-side on desktop
  const useGrid = series.length >= 2 && series.length <= 4;

  // Expand/collapse all helper
  const allKeys = series.flatMap((s) => s.fixtures.map(([f]) => `${s.name}::${f}`));
  const allExpanded = allKeys.length > 0 && allKeys.every((k) => expanded.has(k));
  const toggleAll = () => {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(allKeys));
  };

  return (
    <div className="space-y-4">
      {/* Expand/collapse all */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggleAll}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {allExpanded ? 'Colapsar todas' : 'Expandir todas'}
        </button>
      </div>

      <div className={useGrid ? 'grid gap-6 lg:grid-cols-2' : 'space-y-6'}>
        {series.map((s) => (
          <div key={s.name}>
            {showSeriesHeaders && (
              <div className="mb-3 flex items-center gap-2">
                <div className="h-5 w-1 rounded-full bg-purple-500" />
                <h3 className="text-sm font-bold">{s.name}</h3>
                <span className="text-[10px] text-muted-foreground">{s.fixtures.length} jornadas</span>
              </div>
            )}
            <div className="space-y-1">
              {s.fixtures.map(([fixture, matches]) => {
                const key = `${s.name}::${fixture}`;
                const isOpen = expanded.has(key);
                return (
                  <JornadaAccordion
                    key={key}
                    fixture={fixture}
                    matches={matches}
                    isOpen={isOpen}
                    showScore={isResults}
                    onToggle={() => toggleJornada(key)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Collapsible jornada section — compact header with match count, expandable match list */
function JornadaAccordion({
  fixture, matches, isOpen, showScore, onToggle,
}: {
  fixture: string;
  matches: FpfMatchRow[];
  isOpen: boolean;
  showScore: boolean;
  onToggle: () => void;
}) {
  // Extract jornada number for the badge
  const num = fixture.match(/(\d+)/)?.[1] ?? '';

  return (
    <div className={`rounded-lg border overflow-hidden transition-colors ${isOpen ? 'border-purple-200 dark:border-purple-800/40' : ''}`}>
      {/* Jornada header — always visible, clickable */}
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
          isOpen ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-muted/50'
        }`}
      >
        <svg
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90 text-purple-500' : ''}`}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4 2l4 4-4 4z" />
        </svg>
        {/* Jornada number badge */}
        <span className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
          isOpen
            ? 'bg-purple-500 text-white'
            : 'bg-muted text-muted-foreground'
        }`}>
          J{num}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{fixture.replace(/\d+/, '').trim()}</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{matches.length} jogos</span>
      </button>

      {/* Expanded match list */}
      {isOpen && (
        <div className="border-t border-purple-100 dark:border-purple-800/30">
          {matches.map((m, i) => (
            <MatchRow key={m.id} match={m} showScore={showScore} isEven={i % 2 === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Single match row — clean monochrome: bold winner, muted loser, neutral score */
function MatchRow({ match, showScore, isEven }: { match: FpfMatchRow; showScore: boolean; isEven: boolean }) {
  const h = match.home_score;
  const a = match.away_score;
  const hasScore = showScore && h != null && a != null;
  const isDraw = hasScore && h === a;
  const homeWin = hasScore && !isDraw && h! > a!;
  const awayWin = hasScore && !isDraw && a! > h!;

  // Winner bold + full color, loser muted, draw both normal
  const homeNameCls = homeWin ? 'font-semibold text-foreground' : isDraw ? 'text-foreground' : awayWin ? 'text-muted-foreground' : 'text-foreground';
  const awayNameCls = awayWin ? 'font-semibold text-foreground' : isDraw ? 'text-foreground' : homeWin ? 'text-muted-foreground' : 'text-foreground';

  return (
    <div className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
      isEven ? 'bg-muted/30' : 'bg-background'
    } hover:bg-muted/50`}>
      <span className={`min-w-0 flex-1 truncate text-right text-[11px] ${homeNameCls}`}>
        {decodeHtmlEntities(match.home_team)}
      </span>
      {hasScore ? (
        <span className="inline-flex items-center justify-center w-14 rounded-md bg-muted/60 px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums shrink-0 text-foreground">
          {h} - {a}
        </span>
      ) : (
        <span className="w-14 text-center text-[11px] text-muted-foreground shrink-0">vs</span>
      )}
      <span className={`min-w-0 flex-1 truncate text-[11px] ${awayNameCls}`}>
        {decodeHtmlEntities(match.away_team)}
      </span>
    </div>
  );
}

/* ───────────── Suggestion List with Manual Search ───────────── */

/** Shows auto-suggestions + inline manual search for linking competition players to eskout */
function SuggestionList({
  suggestions,
  selected,
  onSelect,
  initialSearch,
}: {
  suggestions: PlayerSuggestion[];
  selected: number | undefined;
  onSelect: (eskoutPlayerId: number) => void;
  initialSearch: string;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const res = await searchEskoutPlayers(q.trim());
      setSearching(false);
      if (res.success) setSearchResults(res.data ?? []);
    }, 300);
  }, []);

  // Render a single suggestion row (shared between auto + search results)
  const renderRow = (s: PlayerSuggestion, isSearchResult?: boolean) => {
    const isSelected = selected === s.eskoutPlayerId;
    return (
      <div key={s.eskoutPlayerId} className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSelect(s.eskoutPlayerId)}
          className={`flex flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
            isSelected
              ? 'bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-900/20 dark:ring-emerald-700'
              : 'hover:bg-muted/50'
          }`}
        >
          <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[8px] shrink-0 ${
            isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-300'
          }`}>
            {isSelected ? '✓' : ''}
          </span>
                    {s.eskoutPhotoUrl && (
            <img src={s.eskoutPhotoUrl} alt="" className="h-6 w-6 rounded-full object-cover bg-muted shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <span className={`font-medium ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{s.eskoutName}</span>
          {s.eskoutClub && <span className="text-muted-foreground">{s.eskoutClub}</span>}
          {s.crossClub && <span className="text-[9px] text-amber-600 font-medium">clube ≠</span>}
          {!isSearchResult && s.score > 0 && (
            <span className={`ml-auto text-[10px] tabular-nums ${
              s.score >= 80 ? 'text-emerald-600' : s.score >= 50 ? 'text-amber-600' : 'text-muted-foreground'
            }`}>
              {s.score}%
            </span>
          )}
        </button>
        {s.eskoutFpfLink && (
          <a
            href={s.eskoutFpfLink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] text-blue-500 hover:text-blue-700 px-1"
            title="Ver perfil FPF"
            onClick={(e) => e.stopPropagation()}
          >
            FPF
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {/* Auto suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-0.5">
          {suggestions.map((s) => renderRow(s))}
        </div>
      )}

      {/* Manual search toggle + input */}
      {!showSearch ? (
        <button
          type="button"
          onClick={() => { setShowSearch(true); setSearchQuery(initialSearch); handleSearch(initialSearch); }}
          className="text-[11px] text-blue-500 hover:text-blue-700 px-2.5 py-1"
        >
          <Search className="inline h-3 w-3 mr-1" />Pesquisar manualmente
        </button>
      ) : (
        <div className="space-y-1 pt-1 border-t border-dashed">
          <div className="flex items-center gap-1.5 px-1">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Nome do jogador…"
              className="flex-1 text-xs bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
              autoFocus
            />
            {searching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            <button type="button" onClick={() => { setShowSearch(false); setSearchResults([]); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-0.5">
              {searchResults.map((s) => renderRow(s, true))}
            </div>
          )}
          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic px-2.5">Sem resultados</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Unlinked Players Tab ───────────── */

function UnlinkedPlayersTab({ competitionId, onCountChange }: { competitionId: number; onCountChange?: (count: number) => void }) {
  const [players, setPlayers] = useState<UnlinkedWithSuggestions[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  // Track selected eskout player for ambiguous matches (keyed by original index)
  const [selections, setSelections] = useState<Map<number, number>>(new Map());
  // Track auto-linked count after bulk link
  const [autoLinkedCount, setAutoLinkedCount] = useState(0);

  // Fetch unlinked players with fuzzy suggestions
  useEffect(() => {
    let cancelled = false;
    getUnlinkedWithSuggestions(competitionId).then((res) => {
      if (cancelled) return;
      if (res.success) {
        const data = res.data ?? [];
        setPlayers(data);
        onCountChange?.(data.length);
      } else {
        setError(res.error ?? 'Erro');
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [competitionId, onCountChange]);

  // Categorize players into 3 groups
  const categorized = useMemo(() => {
    if (!players) return null;

    const autoLink: (UnlinkedWithSuggestions & { originalIdx: number })[] = [];
    const ambiguous: (UnlinkedWithSuggestions & { originalIdx: number })[] = [];
    const noMatch: UnlinkedWithSuggestions[] = [];

    players.forEach((p, i) => {
      if (p.suggestions.length === 1 && p.suggestions[0].score >= 70 && !p.suggestions[0].crossClub) {
        // Single strong match from same club → auto-link
        autoLink.push({ ...p, originalIdx: i });
      } else if (p.suggestions.length > 1) {
        // Multiple matches → needs manual selection
        ambiguous.push({ ...p, originalIdx: i });
      } else if (p.suggestions.length === 1) {
        // Single weak match → also ambiguous, show for confirmation
        ambiguous.push({ ...p, originalIdx: i });
      } else {
        // No match at all
        noMatch.push(p);
      }
    });

    // Group no-match players by club
    const noMatchByClub = new Map<string, UnlinkedWithSuggestions[]>();
    for (const p of noMatch) {
      const club = p.teamName || 'Clube desconhecido';
      const list = noMatchByClub.get(club) ?? [];
      list.push(p);
      noMatchByClub.set(club, list);
    }

    return { autoLink, ambiguous, noMatch, noMatchByClub };
  }, [players]);

  const handleSelect = (playerIdx: number, eskoutPlayerId: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.get(playerIdx) === eskoutPlayerId) {
        next.delete(playerIdx);
      } else {
        next.set(playerIdx, eskoutPlayerId);
      }
      return next;
    });
  };

  // Submit: auto-link direct matches + manual selections
  const handleSubmit = async () => {
    if (!players || !categorized) return;
    setSubmitting(true);
    setSubmitResult(null);

    const entries: BulkLinkEntry[] = [];

    // Auto-link direct matches
    for (const p of categorized.autoLink) {
      entries.push({
        fpfPlayerId: p.fpfPlayerId,
        playerName: p.playerName,
        teamName: p.teamName,
        eskoutPlayerId: p.suggestions[0].eskoutPlayerId,
      });
    }

    // Manual selections from ambiguous
    for (const [idx, eskoutPlayerId] of selections) {
      const p = players[idx];
      entries.push({
        fpfPlayerId: p.fpfPlayerId,
        playerName: p.playerName,
        teamName: p.teamName,
        eskoutPlayerId,
      });
    }

    if (entries.length === 0) {
      setSubmitting(false);
      return;
    }

    const res = await bulkLinkPlayers(competitionId, entries);
    setSubmitting(false);

    if (res.success) {
      const linked = res.data!.linked;
      setAutoLinkedCount((prev) => prev + categorized.autoLink.length);
      setSubmitResult(`✓ ${linked} jogadores ligados`);
      // Remove linked players from list
      const linkedOriginalIndices = new Set([
        ...categorized.autoLink.map((p) => p.originalIdx),
        ...selections.keys(),
      ]);
      setPlayers((prev) => prev?.filter((_, i) => !linkedOriginalIndices.has(i)) ?? null);
      setSelections(new Map());
    } else {
      setSubmitResult(`Erro: ${res.error}`);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!players?.length && autoLinkedCount === 0) return <EmptyState message="Todos os jogadores estão ligados." />;
  if (!categorized) return null;

  const totalAutoLink = categorized.autoLink.length;
  const totalAmbiguous = categorized.ambiguous.length;
  const totalNoMatch = categorized.noMatch.length;
  const totalActionable = totalAutoLink + selections.size;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {totalAutoLink > 0 && <span className="text-emerald-600 font-medium">{totalAutoLink} match direto</span>}
          {totalAutoLink > 0 && totalAmbiguous > 0 && ' · '}
          {totalAmbiguous > 0 && <span className="text-amber-600 font-medium">{totalAmbiguous} dúvida{totalAmbiguous > 1 ? 's' : ''}</span>}
          {(totalAutoLink > 0 || totalAmbiguous > 0) && totalNoMatch > 0 && ' · '}
          {totalNoMatch > 0 && <span className="text-muted-foreground">{totalNoMatch} sem match</span>}
          {autoLinkedCount > 0 && <span className="text-emerald-600"> · {autoLinkedCount} já ligados</span>}
        </p>
      </div>

      {submitResult && (
        <p className={`text-xs font-medium ${submitResult.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
          {submitResult}
        </p>
      )}

      {/* ── Auto-link section: just a confirmation banner ── */}
      {totalAutoLink > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-3">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {totalAutoLink} jogador{totalAutoLink > 1 ? 'es' : ''} com match direto — ser{totalAutoLink > 1 ? 'ão' : 'á'} ligado{totalAutoLink > 1 ? 's' : ''} automaticamente
          </p>
        </div>
      )}

      {/* ── Ambiguous section: needs manual selection ── */}
      {totalAmbiguous > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-600">Dúvidas — selecionar o jogador correto:</p>
          {categorized.ambiguous.map((p) => {
            const selected = selections.get(p.originalIdx);

            return (
              <div key={`${p.fpfPlayerId ?? p.playerName}-${p.teamName}-${p.originalIdx}`} className="rounded-lg border p-3 space-y-2">
                {/* Player header with FPF photo */}
                <div className="flex items-start gap-2.5">
                  {p.fpfPlayerId && (
                    <img
                      src={`https://resultados.fpf.pt/Player/Logo/${p.fpfPlayerId}`}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover bg-muted shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {decodeHtmlEntities(p.playerName)}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({p.teamName ? decodeHtmlEntities(p.teamName) : <span className="text-red-500">clube: falha no parser</span>})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      · {p.totalGames} jogo{p.totalGames > 1 ? 's' : ''}
                    </p>
                  </div>
                  {selected != null && (
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" title="Selecionado" />
                  )}
                </div>

                {/* Suggestion options + manual search */}
                <SuggestionList
                  suggestions={p.suggestions}
                  selected={selected}
                  onSelect={(eskoutId) => handleSelect(p.originalIdx, eskoutId)}
                  initialSearch={p.playerName}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── No match section: grouped by club ── */}
      {totalNoMatch > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sem match — importar estes clubes primeiro:</p>
          {Array.from(categorized.noMatchByClub.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([club, clubPlayers]) => (
              <div key={club} className="rounded-lg border p-3 space-y-1">
                <p className="text-sm font-medium">
                  {decodeHtmlEntities(club)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({clubPlayers.length} jogador{clubPlayers.length > 1 ? 'es' : ''})
                  </span>
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {clubPlayers.map((p, i) => (
                    <span key={i} className="text-xs text-muted-foreground">{decodeHtmlEntities(p.playerName)}</span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Bottom submit bar (sticky) */}
      {totalActionable > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
            className="shadow-lg"
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A ligar…</>
            ) : (
              <>Ligar {totalActionable} jogador{totalActionable > 1 ? 'es' : ''}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ───────────── Player Link Helper ───────────── */

function PlayerLink({ name, eskoutId, isInEskout }: { name: string; eskoutId?: number | null; isInEskout?: boolean }) {
  const linked = eskoutId != null || isInEskout;

  if (eskoutId) {
    return (
      <Link href={`/jogadores/${eskoutId}`} className="text-xs font-medium text-purple-700 hover:underline">
        {name}
      </Link>
    );
  }

  return (
    <span className={`text-xs font-medium ${linked ? 'text-purple-700' : ''}`}>
      {name}
    </span>
  );
}
