// src/app/admin/dados/loading.tsx
// Loading state for Qualidade de Dados page — shows explanation while analyzing 6000+ players
// RELEVANT FILES: src/components/ui/page-spinner.tsx

import { PageSpinner } from '@/components/ui/page-spinner';

export default function AdminDadosLoading() {
  return <PageSpinner message="A analisar todos os jogadores..." />;
}
