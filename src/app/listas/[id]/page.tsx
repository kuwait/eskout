// src/app/listas/[id]/page.tsx
// List detail page — shows players in a specific list with add/remove/note/export/share
// Adapted from the original A Observar page, now generic for any list
// RELEVANT FILES: src/app/listas/[id]/ListDetailClient.tsx, src/actions/player-lists.ts, src/lib/types/index.ts

import { getActiveClub } from '@/lib/supabase/club-context';
import { redirect, notFound } from 'next/navigation';
import { getListById, getListItems, getListShares } from '@/actions/player-lists';
import { getClubMembers } from '@/actions/users';
import { ListDetailClient } from './ListDetailClient';

export const dynamic = 'force-dynamic';

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getActiveClub();

  // All roles can access lists

  const { id } = await params;
  const listId = parseInt(id, 10);
  if (isNaN(listId)) notFound();

  const [list, items, shares, clubMembers] = await Promise.all([
    getListById(listId),
    getListItems(listId),
    getListShares(listId),
    getClubMembers(),
  ]);

  if (!list) notFound();

  // Verify access: owner, admin, or shared user
  const isOwner = list.userId === ctx.userId;
  const isAdmin = ctx.role === 'admin';
  const isShared = shares.some(s => s.userId === ctx.userId);
  if (!isOwner && !isAdmin && !isShared) notFound();

  return (
    <ListDetailClient
      list={list}
      items={items}
      canExport={ctx.role === 'admin' || ctx.role === 'editor'}
      isOwner={isOwner || isAdmin}
      currentUserId={ctx.userId}
      clubMembers={clubMembers}
      shares={shares.map(s => ({ id: s.id, userId: s.userId, userName: s.userName }))}
    />
  );
}
