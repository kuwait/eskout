// src/app/admin/dados/qualidade/page.tsx
// Standalone page for data quality checks — accessible via sidebar subitem
// Shows players with missing/inconsistent data
// RELEVANT FILES: src/actions/data-quality.ts, src/app/admin/dados/DataQualityClient.tsx

import { getDataQuality } from '@/actions/data-quality';
import { DataQualityClient } from '../DataQualityClient';

export default async function QualidadeDadosPage() {
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
