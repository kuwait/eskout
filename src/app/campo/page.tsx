// src/app/campo/page.tsx
// Redirect /campo to /campo/real — the default squad view
// Exists because old links or direct navigation might hit /campo
// RELEVANT FILES: src/app/campo/real/page.tsx, src/app/campo/sombra/page.tsx

import { redirect } from 'next/navigation';

export default function CampoRedirect() {
  redirect('/campo/real');
}
