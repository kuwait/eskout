// src/components/dashboard/PositionCoverage.tsx
// 10-position grid showing real vs shadow counts per position
// Visual coverage indicator for quick planning overview
// RELEVANT FILES: src/lib/constants.ts, src/lib/supabase/queries.ts, src/app/page.tsx

import { POSITIONS } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PositionCoverageProps {
  byPosition: Record<string, { real: number; shadow: number }>;
}

export function PositionCoverage({ byPosition }: PositionCoverageProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Cobertura por Posição</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {POSITIONS.map(({ code, labelPt }) => {
            const data = byPosition[code] ?? { real: 0, shadow: 0 };
            const hasReal = data.real > 0;
            const hasShadow = data.shadow > 0;

            // Coverage color
            let bgClass = 'bg-red-50 border-red-200';
            if (hasReal && hasShadow) bgClass = 'bg-green-50 border-green-200';
            else if (hasReal || hasShadow) bgClass = 'bg-yellow-50 border-yellow-200';

            return (
              <div
                key={code}
                className={`rounded-md border p-2 text-center ${bgClass}`}
              >
                <p className="text-xs font-bold">{code}</p>
                <p className="truncate text-[10px] text-muted-foreground">{labelPt}</p>
                <div className="mt-1 flex justify-center gap-2 text-xs">
                  <span title="Plantel Real" className="text-green-700">
                    R:{data.real}
                  </span>
                  <span title="Plantel Sombra" className="text-blue-700">
                    S:{data.shadow}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
