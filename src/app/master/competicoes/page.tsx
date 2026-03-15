// src/app/master/competicoes/page.tsx
// Superadmin page for tracking FPF competitions — browse, add, scrape, view list
// Entry point for the competition scraping feature
// RELEVANT FILES: src/actions/scraping/fpf-competitions/scrape-competition.ts, src/app/master/competicoes/CompetitionsClient.tsx

import { getTrackedCompetitions } from '@/actions/scraping/fpf-competitions/scrape-competition';
import { CompetitionsClient } from './CompetitionsClient';

export default async function CompetitionsPage() {
  const result = await getTrackedCompetitions();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-1 text-xl font-bold lg:text-2xl">Competições FPF</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Scraping de dados de jogos para estatísticas e deteção de jogadores acima do escalão.
      </p>
      <CompetitionsClient
        initialData={result.success ? result.data ?? [] : []}
        error={result.success ? undefined : result.error}
      />
    </div>
  );
}
