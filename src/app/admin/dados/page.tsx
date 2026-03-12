// src/app/admin/dados/page.tsx
// Admin page showing players with data quality issues (missing fields, mismatches, duplicates)
// Helps admins identify and fill data gaps across the player database
// RELEVANT FILES: src/actions/data-quality.ts, src/app/admin/dados/DataQualityClient.tsx, src/components/layout/nav-items.ts

import { getDataQuality } from '@/actions/data-quality';
import { DataQualityClient } from './DataQualityClient';

export default async function DataQualityPage() {
  const result = await getDataQuality();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Qualidade de Dados</h1>
      {result.error ? (
        <p className="text-sm text-red-600">{result.error}</p>
      ) : (
        <DataQualityClient players={result.players} totals={result.totals} />
      )}
    </div>
  );
}
