// src/app/admin/dados/importar/page.tsx
// Standalone page for FPF club import — accessible via sidebar subitem
// Shows only the import tool, without the data quality tabs
// RELEVANT FILES: src/app/admin/dados/FpfClubImportTab.tsx, src/components/layout/nav-items.ts

import { FpfClubImportTab } from '../FpfClubImportTab';

export default function ImportarClubePage() {
  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Importar Clubes FPF</h1>
      <FpfClubImportTab />
    </div>
  );
}
