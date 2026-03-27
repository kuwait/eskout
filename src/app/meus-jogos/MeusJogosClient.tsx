// src/app/meus-jogos/MeusJogosClient.tsx
// Client component for scout's assigned games — grouped by round, with links to observe
// Each game card links to the round detail and shows match context for QSR pre-fill
// RELEVANT FILES: src/app/meus-jogos/page.tsx, src/actions/scout-assignments.ts

'use client';

import Link from 'next/link';
import { Binoculars, Calendar, ChevronRight, MapPin } from 'lucide-react';
import type { AssignedGame } from '@/actions/scout-assignments';

/* ───────────── Component ───────────── */

export function MeusJogosClient({ games }: { games: AssignedGame[] }) {
  // Group by round
  const grouped = new Map<number, { roundName: string; games: AssignedGame[] }>();
  for (const game of games) {
    if (!grouped.has(game.roundId)) {
      grouped.set(game.roundId, { roundName: game.roundName, games: [] });
    }
    grouped.get(game.roundId)!.games.push(game);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-neutral-900 sm:text-xl">Meus Jogos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {games.length} jogo{games.length !== 1 ? 's' : ''} atribuído{games.length !== 1 ? 's' : ''}
        </p>
      </div>

      {games.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Binoculars className="h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-500">Sem jogos atribuídos</p>
          <p className="mt-1 text-xs text-muted-foreground">Quando o coordenador te atribuir jogos, aparecem aqui</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([roundId, { roundName, games: roundGames }]) => (
            <div key={roundId}>
              {/* Round header */}
              <Link
                href={`/observacoes/${roundId}`}
                className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-neutral-700 transition"
              >
                <Calendar className="h-3.5 w-3.5" />
                {roundName}
                <ChevronRight className="h-3 w-3" />
              </Link>

              {/* Game cards */}
              <div className="space-y-2">
                {roundGames.map((game) => (
                  <GameCard key={game.assignmentId} game={game} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── Game Card ───────────── */

function GameCard({ game }: { game: AssignedGame }) {
  const dateLabel = new Date(game.matchDate).toLocaleDateString('pt-PT', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  // Build QSR pre-fill query params
  const qsrParams = new URLSearchParams();
  qsrParams.set('qsr', '1');
  if (game.competitionName) qsrParams.set('competition', game.competitionName);
  qsrParams.set('opponent', `${game.homeTeam} vs ${game.awayTeam}`);
  if (game.matchDate) qsrParams.set('matchDate', game.matchDate);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-neutral-900">
          {game.homeTeam} <span className="font-normal text-muted-foreground">vs</span> {game.awayTeam}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{dateLabel}{game.matchTime ? ` · ${game.matchTime}` : ''}</span>
          {game.venue && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {game.venue}
            </span>
          )}
          {game.escalao && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium">{game.escalao}</span>
          )}
          {game.competitionName && (
            <span className="text-muted-foreground/60">{game.competitionName}</span>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="border-t bg-neutral-50/50 px-4 py-2 flex items-center justify-between">
        <Link
          href={`/observacoes/${game.roundId}`}
          className="text-[11px] font-medium text-muted-foreground hover:text-neutral-700 transition"
        >
          Ver jornada
        </Link>
        <Link
          href={`/?${qsrParams.toString()}`}
          className="flex items-center gap-1 rounded-md bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 transition"
        >
          <Binoculars className="h-3 w-3" />
          Observar
        </Link>
      </div>
    </div>
  );
}
