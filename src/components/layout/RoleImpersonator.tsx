// src/components/layout/RoleImpersonator.tsx
// Floating role switcher for superadmins — test the app as any role
// Shows a subtle pill in the bottom-right corner, expands to role selector on click
// RELEVANT FILES: src/actions/impersonate.ts, src/lib/supabase/club-context.ts, src/components/layout/AppShellClient.tsx

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, X } from 'lucide-react';
import { setRoleOverride, clearRoleOverride } from '@/actions/impersonate';
import type { UserRole } from '@/lib/types';

const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'bg-red-500' },
  { value: 'editor', label: 'Editor', color: 'bg-blue-500' },
  { value: 'scout', label: 'Scout', color: 'bg-neutral-500' },
  { value: 'recruiter', label: 'Recrutador', color: 'bg-purple-500' },
];

interface RoleImpersonatorProps {
  /** The currently active role (may be overridden) */
  currentRole: string;
}

export function RoleImpersonator({ currentRole }: RoleImpersonatorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSelect(role: UserRole) {
    startTransition(async () => {
      await setRoleOverride(role);
      setOpen(false);
      router.refresh();
    });
  }

  function handleClear() {
    startTransition(async () => {
      await clearRoleOverride();
      setOpen(false);
      router.refresh();
    });
  }

  const activeRole = ROLES.find((r) => r.value === currentRole);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Expanded selector */}
      {open && (
        <div className="mb-2 rounded-xl border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Simular role</span>
            <button onClick={() => setOpen(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {ROLES.map((role) => (
              <button
                key={role.value}
                onClick={() => handleSelect(role.value)}
                disabled={isPending}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  currentRole === role.value
                    ? 'bg-neutral-100 text-foreground'
                    : 'text-muted-foreground hover:bg-neutral-50 hover:text-foreground'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${role.color}`} />
                {role.label}
                {currentRole === role.value && <span className="ml-auto text-[10px] text-muted-foreground">ativo</span>}
              </button>
            ))}
          </div>
          <button
            onClick={handleClear}
            disabled={isPending}
            className="mt-2 w-full rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-neutral-50 hover:text-foreground"
          >
            Limpar override
          </button>
        </div>
      )}

      {/* Floating pill — always visible for superadmins */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:bg-accent"
      >
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={`h-2 w-2 rounded-full ${activeRole?.color ?? 'bg-neutral-400'}`} />
        <span>{activeRole?.label ?? currentRole}</span>
      </button>
    </div>
  );
}
