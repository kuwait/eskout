// src/app/a-observar/page.tsx
// Personal observation shortlist — players the user wants to observe/follow
// Admin/editor/recruiter only. Admin secretly sees all users' lists.
// RELEVANT FILES: src/app/a-observar/ObservationListClient.tsx, src/actions/observation-list.ts

import { getActiveClub } from '@/lib/supabase/club-context';
import { redirect } from 'next/navigation';
import { getMyObservationList, getAllObservationLists } from '@/actions/observation-list';
import { ObservationListClient } from './ObservationListClient';

export const dynamic = 'force-dynamic';

export default async function ObservationListPage() {
  const ctx = await getActiveClub();

  // Scouts don't have access
  if (ctx.role === 'scout') {
    redirect('/');
  }

  const [myList, allLists] = await Promise.all([
    getMyObservationList(),
    // Admin gets all lists (secret) — others get empty
    ctx.role === 'admin' ? getAllObservationLists() : Promise.resolve([]),
  ]);

  return (
    <ObservationListClient
      myList={myList}
      allLists={allLists}
      isAdmin={ctx.role === 'admin'}
    />
  );
}
