// src/app/campo/real/page.tsx
// Plantel Real page — shows real squad players grouped by position
// Separate route so sidebar can link directly to real squad
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/layout/Sidebar.tsx, src/app/campo/sombra/page.tsx

import { SquadPanelView } from '@/components/squad/SquadPanelView';

export default function PlantelRealPage() {
  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Plantel Real</h1>
      <SquadPanelView squadType="real" />
    </div>
  );
}
