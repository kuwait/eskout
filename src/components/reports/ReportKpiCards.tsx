// src/components/reports/ReportKpiCards.tsx
// KPI metric cards for the admin reports dashboard — total, unique players, avg rating, this month
// Pure server component, no interactivity
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/admin/relatorios/page.tsx

import { FileText, Users, Star, TrendingUp } from 'lucide-react';

interface Kpis {
  totalReports: number;
  uniquePlayers: number;
  avgRating: number | null;
  reportsThisMonth: number;
}

const CARDS: Array<{
  key: keyof Kpis;
  label: string;
  icon: React.ElementType;
  format: (v: number | null) => string;
  color: string;
  bg: string;
}> = [
  { key: 'totalReports', label: 'Total Relatórios', icon: FileText, format: (v) => String(v ?? 0), color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'uniquePlayers', label: 'Jogadores Observados', icon: Users, format: (v) => String(v ?? 0), color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'avgRating', label: 'Rating Médio', icon: Star, format: (v) => v != null ? v.toFixed(1) : '—', color: 'text-yellow-600', bg: 'bg-yellow-50' },
  { key: 'reportsThisMonth', label: 'Este Mês', icon: TrendingUp, format: (v) => String(v ?? 0), color: 'text-emerald-600', bg: 'bg-emerald-50' },
];

export function ReportKpiCards({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.key} className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{c.format(kpis[c.key] as number | null)}</p>
          </div>
        );
      })}
    </div>
  );
}
