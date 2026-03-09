// src/app/meus-jogadores/MeusJogadoresClient.tsx
// Client component for scout/recruiter personal player list
// Shows players added by the current user with status badges and add button
// RELEVANT FILES: src/app/meus-jogadores/page.tsx, src/app/jogadores/novo/page.tsx

'use client';

import Link from 'next/link';
import { UserPlus, Clock, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlayerRow {
  id: number;
  name: string;
  dob: string;
  club: string;
  position: string | null;
  pendingApproval: boolean;
  createdAt: string;
}

export function MeusJogadoresClient({
  players,
  isScout,
}: {
  players: PlayerRow[];
  isScout: boolean;
}) {
  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold lg:text-2xl">Jogadores</h1>
        <Link href="/jogadores/novo">
          <Button size="sm" className="gap-1">
            <UserPlus className="h-4 w-4" />
            Adicionar
          </Button>
        </Link>
      </div>

      {players.length === 0 && (
        <div className="rounded-lg border bg-white p-8 text-center">
          <UserPlus className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Ainda não adicionaste nenhum jogador.
          </p>
          <Link href="/jogadores/novo">
            <Button size="sm">Adicionar Jogador</Button>
          </Link>
        </div>
      )}

      {players.length > 0 && (
        <div className="space-y-2">
          {players.map((p) => (
            <Link
              key={p.id}
              href={`/jogadores/${p.id}`}
              className="flex items-center gap-3 rounded-lg border bg-white p-3 hover:bg-neutral-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {isScout && p.pendingApproval && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      <Clock className="h-3 w-3" />
                      Pendente
                    </span>
                  )}
                  {isScout && !p.pendingApproval && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      <CheckCircle className="h-3 w-3" />
                      Aprovado
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.club} {p.position && `· ${p.position}`} · {formatDate(p.dob)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground shrink-0">{formatDate(p.createdAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
