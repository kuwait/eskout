// src/app/jogadores/novo/page.tsx
// Add new player page with mobile-optimized form
// Available to both admin and scout roles
// RELEVANT FILES: src/components/players/PlayerForm.tsx, src/actions/players.ts, src/lib/validators.ts

import { PlayerForm } from '@/components/players/PlayerForm';

export default function NovoJogadorPage() {
  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Adicionar Jogador</h1>
      <PlayerForm />
    </div>
  );
}
