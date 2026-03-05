// src/app/campo/sombra/page.tsx
// Plantel Sombra page — shows shadow squad players grouped by position
// Separate route so sidebar can link directly to shadow squad
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/layout/Sidebar.tsx, src/app/campo/real/page.tsx

import { SquadPanelView } from '@/components/squad/SquadPanelView';

export default function PlantelSombraPage() {
  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Plantel Sombra</h1>
      <SquadPanelView squadType="shadow" />
    </div>
  );
}
