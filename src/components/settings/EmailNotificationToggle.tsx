// src/components/settings/EmailNotificationToggle.tsx
// Client component for toggling email notification preferences
// Master toggle + granular per task type (contact, meeting, training, signing)
// RELEVANT FILES: src/actions/notification-preferences.ts, src/app/preferencias/page.tsx

'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateNotificationPreferences, type NotificationPreferences } from '@/actions/notification-preferences';

/* ───────────── Toggle Switch ───────────── */

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-neutral-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

/* ───────────── Main Component ───────────── */

interface Props {
  initialPrefs: NotificationPreferences;
}

export function EmailNotificationToggles({ initialPrefs }: Props) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [isPending, startTransition] = useTransition();

  function handleChange(key: keyof NotificationPreferences, value: boolean) {
    const updated = { ...prefs, [key]: value };

    // If master toggle is turned off, disable all granular toggles
    if (key === 'emailAll' && !value) {
      updated.emailOnContact = false;
      updated.emailOnMeeting = false;
      updated.emailOnTraining = false;
      updated.emailOnSigning = false;
    }

    // If master toggle is turned on, enable all granular toggles
    if (key === 'emailAll' && value) {
      updated.emailOnContact = true;
      updated.emailOnMeeting = true;
      updated.emailOnTraining = true;
      updated.emailOnSigning = true;
    }

    // If any granular toggle is turned on, ensure master is on
    if (key !== 'emailAll' && value && !prefs.emailAll) {
      updated.emailAll = true;
    }

    // If all granular toggles are off, turn off master
    if (key !== 'emailAll' && !value) {
      const others = {
        emailOnContact: key === 'emailOnContact' ? false : updated.emailOnContact,
        emailOnMeeting: key === 'emailOnMeeting' ? false : updated.emailOnMeeting,
        emailOnTraining: key === 'emailOnTraining' ? false : updated.emailOnTraining,
        emailOnSigning: key === 'emailOnSigning' ? false : updated.emailOnSigning,
      };
      if (!others.emailOnContact && !others.emailOnMeeting && !others.emailOnTraining && !others.emailOnSigning) {
        updated.emailAll = false;
      }
    }

    setPrefs(updated);

    startTransition(async () => {
      const result = await updateNotificationPreferences(updated);
      if (!result.success) {
        setPrefs(prefs); // revert
        toast.error(result.error ?? 'Erro ao guardar');
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Master toggle */}
      <Toggle
        checked={prefs.emailAll}
        onChange={(v) => handleChange('emailAll', v)}
        disabled={isPending}
        label="Todas as notificações"
      />

      {/* Granular toggles — indented, shown when master is on */}
      {prefs.emailAll && (
        <div className="ml-4 space-y-2.5 border-l-2 border-neutral-100 pl-4">
          <Toggle
            checked={prefs.emailOnContact}
            onChange={(v) => handleChange('emailOnContact', v)}
            disabled={isPending}
            label="📞 Contacto atribuído"
          />
          <Toggle
            checked={prefs.emailOnMeeting}
            onChange={(v) => handleChange('emailOnMeeting', v)}
            disabled={isPending}
            label="🤝 Reunião marcada"
          />
          <Toggle
            checked={prefs.emailOnTraining}
            onChange={(v) => handleChange('emailOnTraining', v)}
            disabled={isPending}
            label="⚽ Treino agendado"
          />
          <Toggle
            checked={prefs.emailOnSigning}
            onChange={(v) => handleChange('emailOnSigning', v)}
            disabled={isPending}
            label="✍️ Assinatura marcada"
          />
        </div>
      )}
    </div>
  );
}
