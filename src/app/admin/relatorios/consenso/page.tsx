// src/app/admin/relatorios/consenso/page.tsx
// Multi-scout consensus page — players observed by 2+ scouts with agreement/disagreement flags
// Accessed via tab nav from /admin/relatorios
// RELEVANT FILES: src/actions/scout-reports.ts, src/components/reports/ConsensusView.tsx

import { getMultiScoutConsensus } from '@/actions/scout-reports';
import { ConsensusView } from '@/components/reports/ConsensusView';

export default async function ConsensoPage() {
  const entries = await getMultiScoutConsensus();

  return <ConsensusView entries={entries} />;
}
