// src/app/campo/[squadId]/page.tsx
// Dynamic squad page — shows a specific squad by ID
// Resolves squad type from DB and renders SquadPanelView with the correct type
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/app/campo/real/page.tsx, src/lib/supabase/queries.ts

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SquadPanelView } from '@/components/squad/SquadPanelView';
import type { SquadType } from '@/lib/types';

interface PageProps {
  params: Promise<{ squadId: string }>;
}

export default async function SquadByIdPage({ params }: PageProps) {
  const { squadId: rawId } = await params;
  const squadId = parseInt(rawId, 10);
  if (isNaN(squadId)) notFound();

  const supabase = await createClient();
  const { data: squad } = await supabase
    .from('squads')
    .select('id, name, squad_type')
    .eq('id', squadId)
    .single();

  if (!squad) notFound();

  const squadType = squad.squad_type as SquadType;
  const title = squadType === 'real' ? 'Planteis' : 'Planteis Sombra';

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">{title}</h1>
      <SquadPanelView
        squadType={squadType}
        initialSquadId={squadId}
      />
    </div>
  );
}
