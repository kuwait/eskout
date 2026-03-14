// src/app/loading.tsx
// Root loading state — fallback for any route without its own loading.tsx
// RELEVANT FILES: src/components/ui/page-spinner.tsx

import { PageSpinner } from '@/components/ui/page-spinner';

export default function RootLoading() {
  return <PageSpinner />;
}
