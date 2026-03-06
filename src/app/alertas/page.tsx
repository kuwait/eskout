// src/app/alertas/page.tsx
// Alertas page showing all important and urgent observation notes across players
// Acts as an action queue for scouts and admins to address flagged items
// RELEVANT FILES: src/components/dashboard/FlaggedNotesInbox.tsx, src/lib/supabase/queries.ts, src/components/layout/MobileNav.tsx

import { getFlaggedNotes } from '@/lib/supabase/queries';
import { FlaggedNotesInbox } from '@/components/dashboard/FlaggedNotesInbox';
import { Bell } from 'lucide-react';

export default async function AlertasPage() {
  const flaggedNotes = await getFlaggedNotes();

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Bell className="h-5 w-5" />
        <h1 className="text-xl font-bold lg:text-2xl">Notas Prioritárias</h1>
      </div>

      {flaggedNotes.length > 0 ? (
        <FlaggedNotesInbox notes={flaggedNotes} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16 text-center">
          <Bell className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-lg font-medium text-neutral-400">Tudo limpo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            As notas marcadas como importantes ou urgentes aparecem aqui.
          </p>
        </div>
      )}
    </div>
  );
}
