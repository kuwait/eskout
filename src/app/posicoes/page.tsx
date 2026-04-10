// src/app/posicoes/page.tsx
// Position-by-position view showing real squad, shadow squad, and pool for each position
// All 10 positions with coverage indicators in a responsive grid
// RELEVANT FILES: src/components/positions/PositionsView.tsx, src/hooks/useAgeGroup.tsx, src/lib/constants.ts

import { PositionsView } from '@/components/positions/PositionsView';
import { getAuthContext } from '@/lib/supabase/club-context';

export default async function PosicoesPage() {
  const { clubId } = await getAuthContext();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Posições</h1>
      <PositionsView clubId={clubId} />
    </div>
  );
}
