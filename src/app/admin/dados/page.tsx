// src/app/admin/dados/page.tsx
// Admin page showing players with data quality issues + FPF club import tool
// Two tabs: "Qualidade de Dados" (default) and "Importar Clube" for bulk FPF import
// RELEVANT FILES: src/actions/data-quality.ts, src/app/admin/dados/DataQualityClient.tsx, src/app/admin/dados/FpfClubImportTab.tsx

import Link from 'next/link';
import { getDataQuality } from '@/actions/data-quality';
import { DataQualityClient } from './DataQualityClient';
import { FpfClubImportTab } from './FpfClubImportTab';

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function DataQualityPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeTab = params.tab === 'importar' ? 'importar' : 'qualidade';

  // Only fetch data quality when on that tab (avoid unnecessary DB load)
  const result = activeTab === 'qualidade' ? await getDataQuality() : null;

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Dados</h1>

      {/* Tab navigation */}
      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/50 p-1">
        <TabLink href="/admin/dados" active={activeTab === 'qualidade'}>
          Qualidade de Dados
        </TabLink>
        <TabLink href="/admin/dados?tab=importar" active={activeTab === 'importar'}>
          Importar Clube
        </TabLink>
      </div>

      {activeTab === 'qualidade' && result && (
        result.error ? (
          <p className="text-sm text-red-600">{result.error}</p>
        ) : (
          <DataQualityClient players={result.players} totals={result.totals} />
        )
      )}

      {activeTab === 'importar' && <FpfClubImportTab />}
    </div>
  );
}

/* ───────────── Tab Link ───────────── */

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </Link>
  );
}
