// src/app/admin/relatorios/loading.tsx
// Loading state for Relatórios page
// RELEVANT FILES: src/components/ui/page-spinner.tsx

import { PageSpinner } from '@/components/ui/page-spinner';

export default function AdminRelatoriosLoading() {
  return <PageSpinner message="A carregar relatórios..." />;
}
