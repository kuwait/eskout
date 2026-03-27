// src/app/meus-relatorios/page.tsx
// User's personal QSR reports — shows all quick scout reports submitted by the current user
// Card header with player photo, name, club, position (same style as training feedback list)
// RELEVANT FILES: src/actions/quick-scout-reports.ts, src/components/players/QuickReportCard.tsx

import Image from 'next/image';
import Link from 'next/link';
import { Crosshair } from 'lucide-react';
import { getMyQuickReports } from '@/actions/quick-scout-reports';
import { QuickReportCard } from '@/components/players/QuickReportCard';
import { getActiveClub } from '@/lib/supabase/club-context';

export const dynamic = 'force-dynamic';

export default async function MeusRelatoriosPage() {
  const { role } = await getActiveClub();
  const isScout = role === 'scout';
  const { reports, total } = await getMyQuickReports(0, 50);

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Meus Relatórios</h1>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Crosshair className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm">Ainda não submeteste nenhuma avaliação.</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-3">
          <p className="text-xs text-muted-foreground">{total} avaliação{total !== 1 ? 'ões' : ''}</p>
          {reports.map((report) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = report as any;
            const photoUrl = r.playerPhotoUrl as string | null;
            const playerName = (r.playerName as string) || `Jogador #${report.playerId}`;
            const playerClub = (r.playerClub as string) || '';
            const playerPosition = (r.playerPosition as string | null);

            return (
              <div key={report.id} className="rounded-xl border bg-card overflow-hidden">
                {/* Player header — photo + info (same style as training feedback) */}
                <Link
                  href={`/jogadores/${report.playerId}`}
                  className="flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  {/* Square photo */}
                  {photoUrl ? (
                    <Image
                      src={photoUrl}
                      alt={playerName}
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded-lg border object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-neutral-100 text-sm font-bold text-neutral-400">
                      {playerName.charAt(0)}
                    </div>
                  )}
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{playerName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {report.createdAt && new Date(report.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {playerPosition && <> · {playerPosition}</>}
                      {playerClub && <> · {playerClub}</>}
                    </p>
                  </div>
                </Link>
                {/* QSR card */}
                <div className="px-1 py-1">
                  <QuickReportCard report={report} canDelete={!isScout} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
