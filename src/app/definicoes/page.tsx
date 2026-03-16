// src/app/definicoes/page.tsx
// Club settings page — 2-column layout on desktop
// Left: club identity + bulk data update | Right: contact purpose options
// RELEVANT FILES: src/actions/clubs.ts, src/actions/contact-purposes.ts, src/app/definicoes/DefinicoesClient.tsx

import { Phone } from 'lucide-react';
import { getActiveClub } from '@/lib/supabase/club-context';
import { getAllContactPurposes } from '@/actions/contact-purposes';
import { DefinicoesClient } from './DefinicoesClient';
import { ContactPurposeList } from '@/components/admin/ContactPurposeList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DefinicoesPage() {
  const ctx = await getActiveClub();
  const purposes = await getAllContactPurposes();
  const activeCount = purposes.filter((p) => !p.isArchived).length;

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-6 text-xl font-bold lg:text-2xl">Clube</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column — Club identity + bulk update */}
        <div>
          <DefinicoesClient
            clubName={ctx.club.name}
            clubLogoUrl={ctx.club.logoUrl}
          />
        </div>

        {/* Right column — Contact purposes */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Objetivos de Contacto
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                  {activeCount}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Opções que aparecem ao mover um jogador para &quot;Em Contacto&quot;. Arraste para reordenar.
              </p>
              <ContactPurposeList initialPurposes={purposes} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
