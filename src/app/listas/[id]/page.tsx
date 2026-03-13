// src/app/listas/[id]/page.tsx
// List detail page — shows players in a specific list with add/remove/note/export
// Adapted from the original A Observar page, now generic for any list
// RELEVANT FILES: src/app/listas/[id]/ListDetailClient.tsx, src/actions/player-lists.ts, src/lib/types/index.ts

import { getActiveClub } from '@/lib/supabase/club-context';
import { redirect, notFound } from 'next/navigation';
import { getListById, getListItems } from '@/actions/player-lists';
import { ListDetailClient } from './ListDetailClient';

export const dynamic = 'force-dynamic';

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getActiveClub();

  if (ctx.role === 'scout') {
    redirect('/');
  }

  const { id } = await params;
  const listId = parseInt(id, 10);
  if (isNaN(listId)) notFound();

  const [list, items] = await Promise.all([
    getListById(listId),
    getListItems(listId),
  ]);

  if (!list) notFound();

  // Verify ownership (or admin)
  const isOwner = list.userId === ctx.userId;
  const isAdmin = ctx.role === 'admin';
  if (!isOwner && !isAdmin) notFound();

  return (
    <ListDetailClient
      list={list}
      items={items}
      canExport={ctx.role === 'admin' || ctx.role === 'editor'}
    />
  );
}
