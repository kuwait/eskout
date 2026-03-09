// src/app/definicoes/page.tsx
// Club settings page — club identity (name, logo) + bulk external data update
// Admin-only page for club configuration and data synchronization
// RELEVANT FILES: src/actions/clubs.ts, src/actions/scraping.ts, src/app/definicoes/DefinicoesClient.tsx

import { getActiveClub } from '@/lib/supabase/club-context';
import { DefinicoesClient } from './DefinicoesClient';

export default async function DefinicoesPage() {
  const ctx = await getActiveClub();

  return (
    <DefinicoesClient
      clubName={ctx.club.name}
      clubLogoUrl={ctx.club.logoUrl}
    />
  );
}
