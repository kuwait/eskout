// src/components/reports/ReportHighlights.tsx
// Auto-generated highlight chips — best rated this week, most observed player, most active scout
// Horizontal scrollable strip on mobile, inline on desktop
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/admin/relatorios/page.tsx

import Link from 'next/link';
import { Award, Eye, Zap } from 'lucide-react';

interface Highlights {
  bestRatedThisWeek: { playerName: string; rating: number; playerId: number | null } | null;
  mostObservedPlayer: { playerName: string; count: number; playerId: number | null } | null;
  mostActiveScout: { scoutName: string; count: number } | null;
}

export function ReportHighlights({ highlights }: { highlights: Highlights }) {
  const { bestRatedThisWeek, mostObservedPlayer, mostActiveScout } = highlights;

  // Don't render if no highlights available
  if (!bestRatedThisWeek && !mostObservedPlayer && !mostActiveScout) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {bestRatedThisWeek && (
        <HighlightChip
          icon={<Award className="h-3.5 w-3.5 text-yellow-500" />}
          label="Melhor rating (semana)"
          value={`${bestRatedThisWeek.playerName} — ${bestRatedThisWeek.rating}/5`}
          href={bestRatedThisWeek.playerId ? `/jogadores/${bestRatedThisWeek.playerId}` : undefined}
        />
      )}
      {mostObservedPlayer && (
        <HighlightChip
          icon={<Eye className="h-3.5 w-3.5 text-purple-500" />}
          label="Mais observado"
          value={`${mostObservedPlayer.playerName} — ${mostObservedPlayer.count} rel.`}
          href={mostObservedPlayer.playerId ? `/jogadores/${mostObservedPlayer.playerId}` : undefined}
        />
      )}
      {mostActiveScout && (
        <HighlightChip
          icon={<Zap className="h-3.5 w-3.5 text-emerald-500" />}
          label="Scout mais ativo"
          value={`${mostActiveScout.scoutName} — ${mostActiveScout.count} rel.`}
        />
      )}
    </div>
  );
}

function HighlightChip({ icon, label, value, href }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-colors hover:bg-neutral-50">
      {icon}
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-semibold">{value}</p>
      </div>
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}
