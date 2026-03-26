// src/components/players/RecruitmentCard.tsx
// Visual pipeline tracker card showing recruitment status, progress dots, contact assignment, and dates.
// Extracted from PlayerProfile.tsx to reduce file size and improve modularity.
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/components/players/profile-utils.ts, src/lib/constants.ts

'use client';

import { useEffect, useState, useTransition } from 'react';
import { Calendar, Check, Clock, Handshake, MessageCircle, Pause, Pencil, PenLine, Phone, User, Users, X, XCircle } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { RECRUITMENT_LABEL_MAP } from '@/lib/constants';
import { updatePlayer } from '@/actions/players';
import { formatDateTime } from '@/components/players/profile-utils';
import type { RecruitmentStatus } from '@/lib/types';

/* ───────────── Pipeline Steps & Status Visuals ───────────── */

/** Pipeline steps in order (rejeitado is special — shown as end state) */
export const PIPELINE_STEPS = ['por_tratar', 'em_contacto', 'vir_treinar', 'reuniao_marcada', 'a_decidir', 'em_standby', 'confirmado', 'assinou'] as const;

/** Icon + color per status */
export const STATUS_VISUAL: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; ring: string }> = {
  por_tratar:      { icon: Clock,          color: 'text-neutral-500', bg: 'bg-neutral-100',   ring: 'ring-neutral-300' },
  em_contacto:     { icon: MessageCircle,  color: 'text-purple-600',  bg: 'bg-purple-100',    ring: 'ring-purple-300' },
  vir_treinar:     { icon: User,           color: 'text-blue-600',    bg: 'bg-blue-100',      ring: 'ring-blue-300' },
  reuniao_marcada: { icon: Handshake,      color: 'text-orange-600',  bg: 'bg-orange-100',    ring: 'ring-orange-300' },
  a_decidir:       { icon: Clock,          color: 'text-blue-800',    bg: 'bg-blue-100',      ring: 'ring-blue-400' },
  em_standby:      { icon: Pause,          color: 'text-slate-600',   bg: 'bg-slate-100',     ring: 'ring-slate-300' },
  confirmado:      { icon: Check,          color: 'text-green-600',   bg: 'bg-green-100',     ring: 'ring-green-300' },
  assinou:         { icon: PenLine,        color: 'text-green-700',   bg: 'bg-green-100',     ring: 'ring-green-400' },
  rejeitado:       { icon: XCircle,        color: 'text-red-600',     bg: 'bg-red-100',       ring: 'ring-red-300' },
};
const STATUS_DEFAULT_VIS = { icon: Clock, color: 'text-neutral-500', bg: 'bg-neutral-100', ring: 'ring-neutral-300' };

/* ───────────── Recruitment status descriptions ───────────── */

export function statusDescription(status: RecruitmentStatus | null): string {
  const map: Record<string, string> = {
    por_tratar: 'Jogador identificado, aguarda triagem inicial.',
    em_contacto: 'Observado e com interesse. Contacto em curso.',
    vir_treinar: 'Convidado a treinar connosco para avaliação.',
    reuniao_marcada: 'Reunião agendada com jogador ou representante.',
    a_decidir: 'Processo avançado, aguarda decisão do departamento.',
    em_standby: 'Em espera — aprovado mas sem vaga ou a aguardar condições.',
    confirmado: 'Jogador confirmado, a preparar assinatura.',
    assinou: 'Processo concluído — jogador assinou.',
    rejeitado: 'Jogador rejeitou a proposta ou não quer vir.',
  };
  return map[status ?? ''] ?? '';
}

/* ───────────── RecruitmentCard Component ───────────── */

export function RecruitmentCard({ status, daysInStatus, contactAssignedToName, trainingDate, meetingDate, signingDate, meetingAttendees = [], signingAttendees = [], profiles = [], selectedUserId, playerId, canAssign = false }: {
  status: RecruitmentStatus;
  daysInStatus: number | null;
  contactAssignedToName: string | null;
  trainingDate?: string | null;
  meetingDate?: string | null;
  signingDate?: string | null;
  /** User IDs attending the meeting */
  meetingAttendees?: string[];
  /** User IDs attending the signing */
  signingAttendees?: string[];
  /** Club-scoped profiles for inline contact assignment */
  profiles?: { id: string; fullName: string }[];
  selectedUserId?: string | null;
  playerId?: number;
  /** Whether the current user can assign/change the contact person */
  canAssign?: boolean;
}) {
  const vis = STATUS_VISUAL[status] ?? STATUS_DEFAULT_VIS;
  const Icon = vis.icon;
  const label = RECRUITMENT_LABEL_MAP[status as RecruitmentStatus] ?? status;
  const desc = statusDescription(status);
  const isRejected = status === 'rejeitado';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [isSaving, startSaveTransition] = useTransition();
  // Local name state so UI updates instantly after assignment
  const [localAssignedName, setLocalAssignedName] = useState(contactAssignedToName);

  // Sync with server-provided value when it changes (e.g. after realtime refresh)
  useEffect(() => { setLocalAssignedName(contactAssignedToName); }, [contactAssignedToName]);

  const filteredProfiles = profiles.filter((p) => !pickerSearch || p.fullName.toLowerCase().includes(pickerSearch.toLowerCase()));

  // Save contact assignment directly (no edit mode needed)
  function handleAssign(userId: string | null) {
    if (!playerId) return;
    const assignedProfile = userId ? profiles.find((p) => p.id === userId) : null;
    setLocalAssignedName(assignedProfile?.fullName ?? null);
    setPickerOpen(false);
    setPickerSearch('');
    startSaveTransition(async () => {
      await updatePlayer(playerId, { contact_assigned_to: userId });
    });
  }

  // Current step index in the pipeline (rejeitado maps to end)
  const currentIdx = isRejected ? -1 : PIPELINE_STEPS.indexOf(status as typeof PIPELINE_STEPS[number]);

  // Collect relevant dates
  const dates: { label: string; value: string; color: string }[] = [];
  if (trainingDate) dates.push({ label: 'Treino', value: formatDateTime(trainingDate), color: 'text-blue-600' });
  if (meetingDate) dates.push({ label: 'Reunião', value: formatDateTime(meetingDate), color: 'text-orange-600' });
  if (signingDate) dates.push({ label: 'Assinatura', value: formatDateTime(signingDate), color: 'text-green-600' });

  return (
    <div className="rounded-xl border bg-white">
      {/* Mini pipeline progress — dots connected by lines */}
      {!isRejected && (
        <div className="flex items-center justify-between px-4 pt-3">
          {PIPELINE_STEPS.map((step, i) => {
            const stepVis = STATUS_VISUAL[step] ?? STATUS_DEFAULT_VIS;
            const isActive = i === currentIdx;
            const isPast = i < currentIdx;
            const dotColor = isActive ? stepVis.bg.replace('bg-', 'bg-') : isPast ? 'bg-neutral-300' : 'bg-neutral-200';
            return (
              <div key={step} className="flex flex-1 items-center">
                <div className={`shrink-0 rounded-full ${isActive ? `h-2.5 w-2.5 ${dotColor} ring-2 ${stepVis.ring} ring-offset-1` : `h-1.5 w-1.5 ${dotColor}`}`} title={RECRUITMENT_LABEL_MAP[step as RecruitmentStatus]} />
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${isPast ? 'bg-neutral-300' : 'bg-neutral-100'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Status content */}
      <div className="flex items-start gap-3 px-3 py-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${vis.bg}`}>
          <Icon className={`h-5 w-5 ${vis.color}`} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-bold ${vis.color}`}>{label}</span>
            {daysInStatus !== null && daysInStatus > 0 && (
              <span className="text-[10px] text-muted-foreground/50">há {daysInStatus}d</span>
            )}
          </div>
          {desc && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/60">{desc}</p>}
          {/* Contact assignment — show assigned name or "Atribuir alguém" button */}
          {canAssign ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground/50" />
              {localAssignedName ? (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={isSaving}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
                >
                  <span className={`font-semibold ${vis.color}`}>{localAssignedName}</span>
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground/40" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={isSaving}
                  className="text-[11px] font-medium text-blue-500 transition-colors hover:text-blue-700"
                >
                  Atribuir alguém
                </button>
              )}
              {/* Inline picker dialog */}
              <CommandDialog open={pickerOpen} onOpenChange={(v) => { setPickerOpen(v); if (!v) setPickerSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
                <CommandInput
                  placeholder="Pesquisar utilizador..."
                  value={pickerSearch}
                  onValueChange={setPickerSearch}
                  onClear={() => setPickerSearch('')}
                />
                <CommandList>
                  <CommandEmpty>Sem resultados</CommandEmpty>
                  <CommandGroup heading="Utilizadores">
                    {filteredProfiles.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.fullName}
                        onSelect={() => handleAssign(p.id)}
                      >
                        <User className="mr-2 h-4 w-4 text-neutral-400" />
                        {p.fullName}
                        {p.id === selectedUserId && <Check className="ml-auto h-4 w-4 text-blue-500" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {localAssignedName && (
                    <CommandGroup>
                      <CommandItem
                        value="__remover__"
                        onSelect={() => handleAssign(null)}
                        className="text-red-500"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Remover responsável
                      </CommandItem>
                    </CommandGroup>
                  )}
                </CommandList>
              </CommandDialog>
            </div>
          ) : localAssignedName ? (
            <p className="mt-1 text-[11px] font-medium text-muted-foreground/80">
              Responsável: <span className={`font-semibold ${vis.color}`}>{localAssignedName}</span>
            </p>
          ) : null}
          {/* Meeting attendees — shown on "Reunião marcada" */}
          {status === 'reuniao_marcada' && meetingAttendees.length > 0 && (
            <AttendeesLine attendeeIds={meetingAttendees} profiles={profiles} label="Participantes" />
          )}
          {/* Signing attendees — shown on "Confirmado" */}
          {status === 'confirmado' && signingAttendees.length > 0 && (
            <AttendeesLine attendeeIds={signingAttendees} profiles={profiles} label="Responsáveis" />
          )}
        </div>
      </div>
      {/* Dates — inline inside the card */}
      {dates.length > 0 && (
        <div className="border-t border-neutral-100 px-3 py-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {dates.map((d) => (
              <div key={d.label} className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-muted-foreground/40" />
                <span className={`text-[10px] font-semibold ${d.color}`}>{d.label}</span>
                <span className="text-[10px] text-muted-foreground/70">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Attendees Line ───────────── */

/** Resolves user IDs to names and displays them inline */
function AttendeesLine({ attendeeIds, profiles, label }: {
  attendeeIds: string[];
  profiles: { id: string; fullName: string }[];
  label: string;
}) {
  const names = attendeeIds
    .map((id) => profiles.find((p) => p.id === id)?.fullName)
    .filter(Boolean) as string[];
  if (names.length === 0) return null;

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <Users className="h-3 w-3 text-muted-foreground/50" />
      <span className="text-[11px] text-muted-foreground/80">
        {label}: <span className="font-medium text-foreground/70">{names.join(', ')}</span>
      </span>
    </div>
  );
}
