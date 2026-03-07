// src/app/page.tsx
// Home page — renders the Jogadores (players) view directly
// This is the main entry point of the app after login
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/hooks/useAgeGroup.tsx, src/app/jogadores/page.tsx

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlayersView } from '@/components/players/PlayersView';

export default function HomePage() {
  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold lg:text-2xl">Jogadores</h1>
        <Button asChild size="sm">
          <Link href="/jogadores/novo">
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Link>
        </Button>
      </div>
      <PlayersView />
    </div>
  );
}
