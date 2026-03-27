// src/app/meus-jogos/page.tsx
// Redirects to /observacoes — scout games are now shown inline in round detail
// Kept as redirect for backwards compatibility
// RELEVANT FILES: src/app/observacoes/page.tsx

import { redirect } from 'next/navigation';

export default function MeusJogosPage() {
  redirect('/observacoes');
}
