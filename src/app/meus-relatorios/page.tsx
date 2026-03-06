// src/app/meus-relatorios/page.tsx
// Scout's personal reports page — shows only observation notes submitted by the current user
// Scouts have restricted access and can only see their own submitted reports
// RELEVANT FILES: src/lib/supabase/queries.ts, src/middleware.ts, src/components/layout/Sidebar.tsx

import { createClient } from '@/lib/supabase/server';
import { FileText } from 'lucide-react';

export default async function MeusRelatoriosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let notes: { id: number; content: string; match_context: string | null; created_at: string; player_name: string }[] = [];

  if (user) {
    // Fetch observation notes authored by the current user, with player name
    const { data } = await supabase
      .from('observation_notes')
      .select('id, content, match_context, created_at, players!inner(name)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      notes = data.map((n: Record<string, unknown>) => ({
        id: n.id as number,
        content: n.content as string,
        match_context: n.match_context as string | null,
        created_at: n.created_at as string,
        player_name: (n.players as Record<string, unknown>)?.name as string ?? '—',
      }));
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Meus Relatórios</h1>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <FileText className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm">Ainda não submeteste nenhum relatório.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{note.player_name}</p>
                <span className="text-xs text-muted-foreground">
                  {new Date(note.created_at).toLocaleDateString('pt-PT')}
                </span>
              </div>
              {note.match_context && (
                <p className="mt-1 text-xs font-medium text-blue-600">{note.match_context}</p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-snug">{note.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
