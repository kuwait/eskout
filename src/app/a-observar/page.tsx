// src/app/a-observar/page.tsx
// Backward-compatible redirect — /a-observar now lives at /listas
// Preserves bookmarks and shared links
// RELEVANT FILES: src/app/listas/page.tsx

import { redirect } from 'next/navigation';

export default function ObservationListRedirect() {
  redirect('/listas');
}
