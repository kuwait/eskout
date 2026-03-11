// src/app/alertas/page.tsx
// Redirect to /tarefas — flagged notes are now displayed in the tasks page
// Kept for backwards compatibility with bookmarks
// RELEVANT FILES: src/app/tarefas/page.tsx

import { redirect } from 'next/navigation';

export default function AlertasPage() {
  redirect('/tarefas');
}
