// src/components/settings/EmailNotificationToggle.tsx
// Client component for toggling email notifications on/off
// Persists to user_notification_preferences via server action
// RELEVANT FILES: src/actions/notification-preferences.ts, src/app/preferencias/page.tsx

'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setEmailNotificationsEnabled } from '@/actions/notification-preferences';

interface EmailNotificationToggleProps {
  initialEnabled: boolean;
}

export function EmailNotificationToggle({ initialEnabled }: EmailNotificationToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const newValue = !enabled;
    setEnabled(newValue);

    startTransition(async () => {
      const result = await setEmailNotificationsEnabled(newValue);
      if (!result.success) {
        // Revert on error
        setEnabled(!newValue);
        toast.error(result.error ?? 'Erro ao guardar preferência');
      } else {
        toast.success(newValue ? 'Notificações ativadas' : 'Notificações desativadas');
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={isPending}
      onClick={handleToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled ? 'bg-primary' : 'bg-neutral-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
