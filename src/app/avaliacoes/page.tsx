// src/app/avaliacoes/page.tsx
// QSR evaluations page — scouts see own, admin/editor see all with server-side pagination
// Route: /avaliacoes (sub-item of Observações in nav)
// RELEVANT FILES: src/app/avaliacoes/AvaliacoesClient.tsx, src/actions/quick-scout-reports.ts

import { getAuthContext } from '@/lib/supabase/club-context';
import { getMyQuickReports, getAllClubQuickReports } from '@/actions/quick-scout-reports';
import { AvaliacoesClient } from './AvaliacoesClient';

const PAGE_SIZE = 50;

export default async function AvaliacoesPage({ searchParams: searchParamsPromise }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role } = await getAuthContext();
  const searchParams = await searchParamsPromise;
  const isScout = role === 'scout' || role === 'recruiter';
  const canSeeAll = role === 'admin' || role === 'editor';
  const page = Math.max(0, parseInt((searchParams.page as string) ?? '0', 10) || 0);

  const { reports, total } = canSeeAll
    ? await getAllClubQuickReports(page, PAGE_SIZE)
    : await getMyQuickReports(page, PAGE_SIZE);

  return (
    <AvaliacoesClient
      reports={reports}
      total={total}
      isScout={isScout}
      title="Avaliações"
      page={page}
      pageSize={PAGE_SIZE}
    />
  );
}
