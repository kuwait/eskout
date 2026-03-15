// src/app/admin/objetivos-contacto/page.tsx
// Admin page for managing contact purpose options (Objetivo do Contacto)
// Drag-to-reorder, inline edit, add, delete/archive per club
// RELEVANT FILES: src/actions/contact-purposes.ts, src/components/admin/ContactPurposeList.tsx, src/lib/types/index.ts

import { getAllContactPurposes } from '@/actions/contact-purposes';
import { ContactPurposeList } from '@/components/admin/ContactPurposeList';

export default async function ObjetivosContactoPage() {
  const purposes = await getAllContactPurposes();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-1 text-xl font-bold lg:text-2xl">Objetivos de Contacto</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Opções que aparecem ao mover um jogador para &quot;Em Contacto&quot;. Arraste para reordenar.
      </p>
      <ContactPurposeList initialPurposes={purposes} />
    </div>
  );
}
