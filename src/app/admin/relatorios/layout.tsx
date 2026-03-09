// src/app/admin/relatorios/layout.tsx
// Shared layout for admin reports section — tab navigation between reports, scouts, consensus
// Wraps all /admin/relatorios/* sub-routes with consistent header and nav
// RELEVANT FILES: src/app/admin/relatorios/page.tsx, src/app/admin/relatorios/scouts/page.tsx, src/app/admin/relatorios/consenso/page.tsx

import { ReportTabNav } from '@/components/reports/ReportTabNav';

export default function AdminRelatoriosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Relatórios</h1>
      <ReportTabNav />
      {children}
    </div>
  );
}
