// src/app/listas/page.tsx
// Lists index page — shows all user's player lists (grid of cards)
// Admin/editor/recruiter only. Admin secretly sees all users' lists.
// RELEVANT FILES: src/app/listas/ListsPageClient.tsx, src/actions/player-lists.ts, src/lib/types/index.ts

import { getActiveClub } from '@/lib/supabase/club-context';
import { getMyLists, getAllLists } from '@/actions/player-lists';
import { ListsPageClient } from './ListsPageClient';

export const dynamic = 'force-dynamic';

export default async function ListsPage() {
  const ctx = await getActiveClub();

  // All roles can access lists

  const [myLists, allLists] = await Promise.all([
    getMyLists(),
    ctx.role === 'admin' ? getAllLists() : Promise.resolve([]),
  ]);

  return (
    <ListsPageClient
      myLists={myLists}
      allLists={allLists}
      isAdmin={ctx.role === 'admin'}
    />
  );
}
