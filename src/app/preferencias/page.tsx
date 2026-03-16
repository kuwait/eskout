// src/app/preferencias/page.tsx
// User preferences page — theme picker + email notification toggles
// Each user can customize their experience independently
// RELEVANT FILES: src/lib/theme.tsx, src/components/settings/ThemePicker.tsx, src/actions/notification-preferences.ts

import { Mail, Palette } from 'lucide-react';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { EmailNotificationToggles } from '@/components/settings/EmailNotificationToggle';
import { getNotificationPreferences } from '@/actions/notification-preferences';

export default async function PreferenciasPage() {
  const prefs = await getNotificationPreferences();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Preferências</h1>

      <div className="mx-auto max-w-2xl space-y-4">
        {/* Theme */}
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <p className="text-sm font-semibold">Tema</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Escolhe o aspeto visual da aplicação. A preferência é guardada neste dispositivo.
          </p>
          <ThemePicker />
        </div>

        {/* Email notifications */}
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <p className="text-sm font-semibold">Notificações por Email</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Receber email quando te é atribuída uma nova tarefa.
          </p>
          <EmailNotificationToggles initialPrefs={prefs} />
        </div>
      </div>
    </div>
  );
}
