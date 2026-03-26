// src/components/pipeline/PipelineCard.tsx
// Compact player card for the abordagens Kanban/list views
// Shows name, position, club, opinion badge, scheduled dates — links to profile, has remove button
// RELEVANT FILES: src/components/common/OpinionBadge.tsx, src/components/pipeline/StatusColumn.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition, useEffect } from 'react';
import { Building2, Calendar, Check, ChevronsUpDown, EllipsisVertical, FileSignature, GraduationCap, Pause, Pencil, Phone, StickyNote, Trash2, User, Users, X } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { PlayerAvatar } from '@/components/common/PlayerAvatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { updateTrainingDate, updateMeetingDate, updateSigningDate, updateDecisionDate, updateMeetingAttendees, updateSigningAttendees, updateTrainingEscalao, updateStandbyReason } from '@/actions/pipeline';
import { updatePlayer } from '@/actions/players';
import { POSITION_LABELS, RECRUITMENT_STATUSES } from '@/lib/constants';
import type { DecisionSide, Player, PositionCode, RecruitmentStatus } from '@/lib/types';

interface PipelineCardProps {
  player: Player;
  /** Show birth year on card (when viewing all age groups) */
  showBirthYear?: boolean;
  /** Open player profile popup */
  onPlayerClick?: (playerId: number) => void;
  /** Remove from abordagens callback */
  onRemove?: (playerId: number) => void;
  /** Notify parent of training/meeting date change for optimistic update */
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate' | 'decisionDate', newDate: string | null) => void;
  /** Club-scoped profiles for contact assignment */
  clubMembers?: { id: string; fullName: string }[];
  /** Mobile: dropdown to move card between columns (replaces drag-and-drop) */
  onStatusChange?: (playerId: number, newStatus: RecruitmentStatus, decisionSide?: DecisionSide) => void;
  /** Change decision side within a_decidir column */
  onDecisionSideChange?: (playerId: number, side: DecisionSide) => void;
  /** Contact purpose label for em_contacto cards */
  contactPurposeLabel?: string;
  /** Available contact purpose options for editing */
  contactPurposes?: { id: string; label: string }[];
}

/** Format a date string to a compact Portuguese display */
function formatScheduledDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-PT', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/** Config for statuses that support scheduled dates */
const DATE_STATUS_CONFIG = {
  vir_treinar: {
    field: 'trainingDate' as const,
    icon: Calendar,
    dialogTitle: 'Data de Treino',
    placeholder: 'Definir data de treino',
    bgClass: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    iconClass: 'text-amber-500',
    serverAction: updateTrainingDate,
  },
  reuniao_marcada: {
    field: 'meetingDate' as const,
    icon: Users,
    dialogTitle: 'Data de Reunião',
    placeholder: 'Definir data de reunião',
    bgClass: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    iconClass: 'text-orange-500',
    serverAction: updateMeetingDate,
  },
  a_decidir: {
    field: 'decisionDate' as const,
    icon: Calendar,
    dialogTitle: 'Data da Decisão',
    placeholder: 'Definir prazo de decisão',
    bgClass: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    iconClass: 'text-indigo-500',
    serverAction: updateDecisionDate,
  },
  confirmado: {
    field: 'signingDate' as const,
    icon: FileSignature,
    dialogTitle: 'Data de Assinatura',
    placeholder: 'Definir data de assinatura',
    bgClass: 'bg-green-50 text-green-700 hover:bg-green-100',
    iconClass: 'text-green-500',
    serverAction: updateSigningDate,
  },
} as const;

import { shortName } from '@/lib/utils';
// Re-export for consumers that imported from here
export { shortName } from '@/lib/utils';

export function PipelineCard({ player, showBirthYear, onPlayerClick, onRemove, onDateChange, clubMembers = [], onStatusChange, onDecisionSideChange, contactPurposeLabel, contactPurposes = [] }: PipelineCardProps) {
  // Extract birth year from dob for display when all age groups selected
  const birthYear = showBirthYear && player.dob ? new Date(player.dob).getFullYear() : null;
  // Short name on pipeline cards — full name truncated via CSS
  const displayName = shortName(player.name);
  const statusConfig = player.recruitmentStatus
    ? DATE_STATUS_CONFIG[player.recruitmentStatus as keyof typeof DATE_STATUS_CONFIG]
    : undefined;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [isPending, startTransition] = useTransition();

  // Current date value for this player's active status
  const currentDateValue = statusConfig ? player[statusConfig.field] : null;

  // Populate fields from existing date when dialog opens
  /* eslint-disable react-hooks/set-state-in-effect -- syncs form fields with external data when dialog opens */
  useEffect(() => {
    if (dialogOpen && currentDateValue) {
      const existing = currentDateValue.slice(0, 16); // "YYYY-MM-DDTHH:MM"
      setDate(existing.slice(0, 10));
      setTime(existing.slice(11, 16) || '10:00');
    } else if (dialogOpen) {
      setDate('');
      setTime('10:00');
    }
  }, [dialogOpen, currentDateValue]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSave() {
    if (!statusConfig) return;
    const dateTime = date && time ? `${date}T${time}:00` : date ? `${date}T00:00:00` : '';
    const newValue = dateTime || null;

    // Optimistic update via parent
    onDateChange?.(player.id, statusConfig.field, newValue);
    setDialogOpen(false);

    // Persist to server
    startTransition(async () => {
      const result = await statusConfig.serverAction(player.id, newValue);
      if (!result.success) {
        console.error(`update ${statusConfig.field} failed:`, result.error);
      }
    });
  }

  function handleClear() {
    if (!statusConfig) return;

    // Optimistic update via parent
    onDateChange?.(player.id, statusConfig.field, null);
    setDialogOpen(false);

    // Persist to server
    startTransition(async () => {
      const result = await statusConfig.serverAction(player.id, null);
      if (!result.success) {
        console.error(`clear ${statusConfig.field} failed:`, result.error);
      }
    });
  }

  const IconComponent = statusConfig?.icon ?? Calendar;

  // Resolve contact_assigned_to name for vir_treinar display
  const responsibleName = player.contactAssignedTo
    ? (player.contactAssignedToName ?? clubMembers.find((m) => m.id === player.contactAssignedTo)?.fullName ?? null)
    : null;

  return (
    <>
      <div
        className="group relative select-none rounded-md border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md"
      >
        <div
          data-player-link
          className="block w-full cursor-pointer pr-4 text-left"
          onClick={() => onPlayerClick?.(player.id)}
          role={onPlayerClick ? 'button' : undefined}
          tabIndex={onPlayerClick ? 0 : undefined}
        >
          {/* Line 1: year pill + photo/placeholder with tooltip + name */}
          <div className="flex items-center gap-1.5">
            {birthYear && (
              <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-xs font-medium text-blue-700">
                {birthYear}
              </span>
            )}
            <PlayerAvatar
              player={{
                name: player.name,
                photoUrl: player.photoUrl || player.zzPhotoUrl,
                club: player.club,
                position: player.positionNormalized,
                dob: player.dob,
                foot: player.foot,
              }}
              size={20}
            />
            <a
              href={`/jogadores/${player.id}`}
              onClick={(e) => {
                // Left-click: use popup if available; middle/ctrl/cmd: let browser open new tab
                if (e.button === 0 && !e.ctrlKey && !e.metaKey && onPlayerClick) {
                  e.preventDefault();
                  e.stopPropagation();
                  onPlayerClick(player.id);
                }
              }}
              className={`min-w-0 truncate font-medium hover:underline ${displayName.length > 18 ? 'text-xs' : 'text-sm'}`}
            >{displayName}</a>
          </div>
          {/* Line 2: club — links to filtered player list */}
          <Link href={`/?clube=${encodeURIComponent(player.club)}`} onClick={(e) => e.stopPropagation()} className="mt-0.5 block truncate text-xs text-muted-foreground hover:underline">{player.club}</Link>
          {/* Line 3: position */}
          <div className="mt-1 flex items-center gap-1.5">
            {player.positionNormalized && (
              <span className="rounded bg-neutral-100 px-1 py-0.5 text-xs font-medium">
                {POSITION_LABELS[player.positionNormalized as PositionCode] ?? player.positionNormalized}
              </span>
            )}
          </div>
          {/* Line 4: department opinion */}
          {player.departmentOpinion.length > 0 && (
            <div className="mt-1">
              <OpinionBadge opinion={player.departmentOpinion} />
            </div>
          )}
        </div>

        {/* Decision side indicator — shown on "A decidir" cards */}
        {player.recruitmentStatus === 'a_decidir' && player.decisionSide && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            {player.decisionSide === 'club' ? (
              <><Building2 className="h-2.5 w-2.5" /> Clube</>
            ) : (
              <><User className="h-2.5 w-2.5" /> Jogador</>
            )}
          </div>
        )}

        {/* Contact info — shown on "Por tratar" to make it easy to call */}
        {player.recruitmentStatus === 'por_tratar' && player.contact && (
          <a
            data-no-navigate
            href={`tel:${player.contact}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 flex items-center gap-1.5 rounded bg-neutral-50 px-2 py-1 text-xs text-muted-foreground hover:bg-neutral-100 hover:text-foreground"
          >
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{player.contact}</span>
          </a>
        )}

        {/* Contact assignment — shown on "Em contacto" */}
        {player.recruitmentStatus === 'em_contacto' && (
          <ContactAssignButton player={player} clubMembers={clubMembers} />
        )}

        {/* Contact purpose — shown on "Em contacto" cards, clickable to edit */}
        {player.recruitmentStatus === 'em_contacto' && (
          <ContactPurposeButton
            playerId={player.id}
            currentLabel={contactPurposeLabel}
            contactPurposes={contactPurposes}
          />
        )}

        {/* Vir treinar: responsible person + escalão */}
        {player.recruitmentStatus === 'vir_treinar' && (
          <div className="mt-1.5 space-y-1">
            {responsibleName && (
              <div className="flex items-center gap-1.5 rounded bg-purple-50 px-2 py-1 text-xs text-purple-700">
                <Phone className="h-3 w-3 shrink-0" />
                <span className="truncate font-medium">{responsibleName}</span>
              </div>
            )}
            <TrainingEscalaoButton player={player} />
          </div>
        )}

        {/* Meeting attendees — shown on "Reunião marcada" */}
        {player.recruitmentStatus === 'reuniao_marcada' && (
          <MeetingAttendeesButton player={player} clubMembers={clubMembers} />
        )}

        {/* Signing attendees — shown on "Confirmado" for signing responsibility */}
        {player.recruitmentStatus === 'confirmado' && (
          <SigningAttendeesButton player={player} clubMembers={clubMembers} />
        )}

        {/* Standby reason — shown on "Em Stand-by" cards, editable inline */}
        {player.recruitmentStatus === 'em_standby' && (
          <StandbyReasonButton playerId={player.id} currentReason={player.standbyReason} />
        )}

        {/* Scheduled date button — for "Vir treinar", "Reunião Marcada", "Confirmado" */}
        {statusConfig && (
          <button
            data-no-navigate
            onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
            className={`mt-1.5 flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs ${statusConfig.bgClass}`}
          >
            <IconComponent className="h-3 w-3 shrink-0" />
            {currentDateValue
              ? formatScheduledDate(currentDateValue)
              : statusConfig.placeholder}
          </button>
        )}

        {/* Pipeline note — editable inline on any card */}
        <PipelineNoteButton playerId={player.id} currentNote={player.recruitmentNotes} />

        {/* Corner menu with "Mover" + "Remover" — same on mobile and desktop */}
        {onStatusChange && player.recruitmentStatus && (
          <CardActionsMenu
            playerId={player.id}
            currentStatus={player.recruitmentStatus as RecruitmentStatus}
            currentDecisionSide={player.decisionSide}
            onStatusChange={onStatusChange}
            onRemove={onRemove}
            onDecisionSideChange={onDecisionSideChange}
          />
        )}
      </div>

      {/* Scheduled date edit dialog */}
      {statusConfig && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconComponent className={`h-5 w-5 ${statusConfig.iconClass}`} />
                {statusConfig.dialogTitle}
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{player.name}</span>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`card-date-${player.id}`} className="text-xs">Data</Label>
                <Input
                  id={`card-date-${player.id}`}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`card-time-${player.id}`} className="text-xs">Hora</Label>
                <Input
                  id={`card-time-${player.id}`}
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              {currentDateValue && (
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={handleClear} disabled={isPending}>
                  Limpar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ───────────── Contact Assignment Button for Em Contacto cards ───────────── */

function ContactAssignButton({ player, clubMembers }: { player: Player; clubMembers: { id: string; fullName: string }[]}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isSaving, startSave] = useTransition();
  // Resolve name from clubMembers if server didn't hydrate it (e.g. pipeline client-side fetch)
  const resolvedName = player.contactAssignedToName
    ?? (player.contactAssignedTo ? clubMembers.find((p) => p.id === player.contactAssignedTo)?.fullName ?? null : null);
  const [localName, setLocalName] = useState(resolvedName);

  useEffect(() => { setLocalName(resolvedName); }, [resolvedName]);

  const filtered = clubMembers.filter((p) => !search || p.fullName.toLowerCase().includes(search.toLowerCase()));

  function handleAssign(userId: string | null) {
    const profile = userId ? clubMembers.find((p) => p.id === userId) : null;
    setLocalName(profile?.fullName ?? null);
    setPickerOpen(false);
    setSearch('');
    startSave(async () => {
      await updatePlayer(player.id, { contact_assigned_to: userId });
    });
  }

  return (
    <>
      <button
        data-no-navigate
        type="button"
        onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
        disabled={isSaving}
        className={`mt-1.5 flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs ${
          localName
            ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            : 'bg-neutral-50 text-muted-foreground hover:bg-neutral-100'
        }`}
      >
        <Phone className="h-3 w-3 shrink-0" />
        {localName ? (
          <span className="truncate font-medium">{localName}</span>
        ) : (
          <span className="truncate">Atribuir responsável</span>
        )}
        <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
      </button>
      <CommandDialog open={pickerOpen} onOpenChange={(v) => { setPickerOpen(v); if (!v) setSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
        <CommandInput
          placeholder="Pesquisar utilizador..."
          value={search}
          onValueChange={setSearch}
          onClear={() => setSearch('')}
        />
        <CommandList>
          <CommandEmpty>Sem resultados</CommandEmpty>
          <CommandGroup heading="Utilizadores">
            {filtered.map((p) => (
              <CommandItem
                key={p.id}
                value={p.fullName}
                onSelect={() => handleAssign(p.id)}
              >
                <User className="mr-2 h-4 w-4 text-neutral-400" />
                {p.fullName}
                {p.id === player.contactAssignedTo && <Check className="ml-auto h-4 w-4 text-purple-500" />}
              </CommandItem>
            ))}
          </CommandGroup>
          {localName && (
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
    </>
  );
}

/* ───────────── Meeting Attendees Button for Reunião Marcada cards ───────────── */

function MeetingAttendeesButton({ player, clubMembers }: { player: Player; clubMembers: { id: string; fullName: string }[]}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isSaving, startSave] = useTransition();
  const [localAttendees, setLocalAttendees] = useState<string[]>(player.meetingAttendees);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local state with external prop */
  useEffect(() => { setLocalAttendees(player.meetingAttendees); }, [player.meetingAttendees]);

  const filtered = clubMembers.filter((p) => !search || p.fullName.toLowerCase().includes(search.toLowerCase()));

  // Resolve attendee names for display
  const attendeeNames = localAttendees
    .map((id) => clubMembers.find((m) => m.id === id)?.fullName)
    .filter(Boolean) as string[];

  function toggleAttendee(userId: string) {
    const next = localAttendees.includes(userId)
      ? localAttendees.filter((id) => id !== userId)
      : [...localAttendees, userId];
    setLocalAttendees(next);
    startSave(async () => {
      await updateMeetingAttendees(player.id, next);
    });
  }

  return (
    <>
      <button
        data-no-navigate
        type="button"
        onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
        disabled={isSaving}
        className={`mt-1.5 flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs ${
          attendeeNames.length > 0
            ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
            : 'bg-neutral-50 text-muted-foreground hover:bg-neutral-100'
        }`}
      >
        <Users className="h-3 w-3 shrink-0" />
        {attendeeNames.length > 0 ? (
          <span className="truncate font-medium">
            {attendeeNames.length === 1 ? attendeeNames[0] : `${attendeeNames.length} participantes`}
          </span>
        ) : (
          <span className="truncate">Participantes da reunião</span>
        )}
        <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
      </button>
      <CommandDialog open={pickerOpen} onOpenChange={(v) => { setPickerOpen(v); if (!v) setSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
        <CommandInput
          placeholder="Pesquisar utilizador..."
          value={search}
          onValueChange={setSearch}
          onClear={() => setSearch('')}
        />
        <CommandList>
          <CommandEmpty>Sem resultados</CommandEmpty>
          <CommandGroup heading="Selecionar participantes">
            {filtered.map((p) => {
              const isSelected = localAttendees.includes(p.id);
              return (
                <CommandItem
                  key={p.id}
                  value={p.fullName}
                  onSelect={() => toggleAttendee(p.id)}
                >
                  <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded border ${isSelected ? 'border-orange-500 bg-orange-500' : 'border-neutral-300'}`}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  {p.fullName}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

/* ───────────── Signing Attendees Button for Confirmado cards ───────────── */

function SigningAttendeesButton({ player, clubMembers }: { player: Player; clubMembers: { id: string; fullName: string }[]}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isSaving, startSave] = useTransition();
  const [localAttendees, setLocalAttendees] = useState<string[]>(player.signingAttendees);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local state with external prop */
  useEffect(() => { setLocalAttendees(player.signingAttendees); }, [player.signingAttendees]);

  const filtered = clubMembers.filter((p) => !search || p.fullName.toLowerCase().includes(search.toLowerCase()));

  const attendeeNames = localAttendees
    .map((id) => clubMembers.find((m) => m.id === id)?.fullName)
    .filter(Boolean) as string[];

  function toggleAttendee(userId: string) {
    const next = localAttendees.includes(userId)
      ? localAttendees.filter((id) => id !== userId)
      : [...localAttendees, userId];
    setLocalAttendees(next);
    startSave(async () => {
      await updateSigningAttendees(player.id, next);
    });
  }

  return (
    <>
      <button
        data-no-navigate
        type="button"
        onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
        disabled={isSaving}
        className={`mt-1.5 flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs ${
          attendeeNames.length > 0
            ? 'bg-green-50 text-green-700 hover:bg-green-100'
            : 'bg-neutral-50 text-muted-foreground hover:bg-neutral-100'
        }`}
      >
        <Users className="h-3 w-3 shrink-0" />
        {attendeeNames.length > 0 ? (
          <span className="truncate font-medium">
            {attendeeNames.length === 1 ? attendeeNames[0] : `${attendeeNames.length} responsáveis`}
          </span>
        ) : (
          <span className="truncate">Responsáveis da assinatura</span>
        )}
        <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
      </button>
      <CommandDialog open={pickerOpen} onOpenChange={(v) => { setPickerOpen(v); if (!v) setSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
        <CommandInput
          placeholder="Pesquisar utilizador..."
          value={search}
          onValueChange={setSearch}
          onClear={() => setSearch('')}
        />
        <CommandList>
          <CommandEmpty>Sem resultados</CommandEmpty>
          <CommandGroup heading="Selecionar responsáveis">
            {filtered.map((p) => {
              const isSelected = localAttendees.includes(p.id);
              return (
                <CommandItem
                  key={p.id}
                  value={p.fullName}
                  onSelect={() => toggleAttendee(p.id)}
                >
                  <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded border ${isSelected ? 'border-green-500 bg-green-500' : 'border-neutral-300'}`}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  {p.fullName}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

/* ───────────── Training Escalão Button for Vir Treinar cards ───────────── */

function TrainingEscalaoButton({ player }: { player: Player}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(player.trainingEscalao ?? '');
  const [isSaving, startSave] = useTransition();

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local input with external prop */
  useEffect(() => { setValue(player.trainingEscalao ?? ''); }, [player.trainingEscalao]);

  function handleSave() {
    setEditing(false);
    const trimmed = value.trim() || null;
    startSave(async () => {
      await updateTrainingEscalao(player.id, trimmed);
    });
  }

  if (editing) {
    return (
      <div
        data-no-navigate
        className="flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex: Sub-14 A"
          className="h-7 flex-1 text-xs"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={handleSave}
          disabled={isSaving}
        />
      </div>
    );
  }

  return (
    <button
      data-no-navigate
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs ${
        player.trainingEscalao
          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
          : 'bg-neutral-50 text-muted-foreground hover:bg-neutral-100'
      }`}
    >
      <GraduationCap className="h-3 w-3 shrink-0" />
      <span className="truncate">{player.trainingEscalao || 'Definir escalão'}</span>
    </button>
  );
}

/* ───────────── Card Actions Menu (mobile — replaces drag-and-drop + remove button) ───────────── */

function CardActionsMenu({
  playerId,
  currentStatus,
  currentDecisionSide,
  onStatusChange,
  onRemove,
  onDecisionSideChange,
}: {
  playerId: number;
  currentStatus: RecruitmentStatus;
  currentDecisionSide?: DecisionSide | null;
  onStatusChange: (playerId: number, newStatus: RecruitmentStatus, decisionSide?: DecisionSide) => void;
  onRemove?: (playerId: number) => void;
  onDecisionSideChange?: (playerId: number, side: DecisionSide) => void;
}) {
  const [open, setOpen] = useState(false);
  // Follow-up: when user picks "A decidir", show side picker instead of closing
  const [showDecisionPicker, setShowDecisionPicker] = useState(false);

  function handleClose() {
    setOpen(false);
    setShowDecisionPicker(false);
  }

  return (
    <>
      <button
        data-no-navigate
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-neutral-100"
        aria-label="Ações"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {showDecisionPicker ? 'Quem está a decidir?' : 'Mover para'}
            </DialogTitle>
          </DialogHeader>

          {showDecisionPicker ? (
            /* Decision side picker — shown after selecting "A decidir" */
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onStatusChange(playerId, 'a_decidir', 'club');
                  handleClose();
                }}
                className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-neutral-50"
              >
                <Building2 className="h-4 w-4 text-blue-600" />
                Clube a decidir
              </button>
              <button
                type="button"
                onClick={() => {
                  onStatusChange(playerId, 'a_decidir', 'player');
                  handleClose();
                }}
                className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-neutral-50"
              >
                <User className="h-4 w-4 text-purple-600" />
                Jogador a decidir
              </button>
            </div>
          ) : (
            /* Standard status list */
            <>
              <div className="flex flex-col gap-0.5">
                {RECRUITMENT_STATUSES.map((s) => {
                  const isCurrent = s.value === currentStatus;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => {
                        // "A decidir" from another column → show side picker
                        if (s.value === 'a_decidir' && currentStatus !== 'a_decidir') {
                          setShowDecisionPicker(true);
                          return;
                        }
                        onStatusChange(playerId, s.value as RecruitmentStatus);
                        handleClose();
                      }}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        isCurrent
                          ? 'cursor-default bg-neutral-100 font-medium text-foreground'
                          : 'hover:bg-neutral-50'
                      }`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${s.tailwind?.split(' ')[0] ?? 'bg-neutral-400'}`} />
                      {s.labelPt}
                      {isCurrent && <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>

              {/* Decision side toggle — when already in a_decidir, let user switch sides */}
              {currentStatus === 'a_decidir' && onDecisionSideChange && (
                <>
                  <div className="border-t" />
                  <div className="flex flex-col gap-0.5">
                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Alterar lado</p>
                    <button
                      type="button"
                      disabled={currentDecisionSide === 'club'}
                      onClick={() => { onDecisionSideChange(playerId, 'club'); handleClose(); }}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                        currentDecisionSide === 'club' ? 'cursor-default bg-neutral-100 font-medium' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5 text-blue-600" />
                      Clube a decidir
                      {currentDecisionSide === 'club' && <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    <button
                      type="button"
                      disabled={currentDecisionSide === 'player'}
                      onClick={() => { onDecisionSideChange(playerId, 'player'); handleClose(); }}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                        currentDecisionSide === 'player' ? 'cursor-default bg-neutral-100 font-medium' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <User className="h-3.5 w-3.5 text-purple-600" />
                      Jogador a decidir
                      {currentDecisionSide === 'player' && <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </div>
                </>
              )}

              {/* Remove from pipeline */}
              {onRemove && (
                <>
                  <div className="border-t" />
                  <button
                    type="button"
                    onClick={() => { onRemove(playerId); handleClose(); }}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover das abordagens
                  </button>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── Contact Purpose Button for Em Contacto cards ───────────── */

function ContactPurposeButton({
  playerId,
  currentLabel,
  contactPurposes,
}: {
  playerId: number;
  currentLabel?: string;
  contactPurposes: { id: string; label: string }[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [localLabel, setLocalLabel] = useState(currentLabel ?? '');
  const [isSaving, startSave] = useTransition();

  useEffect(() => { setLocalLabel(currentLabel ?? ''); }, [currentLabel]);

  const filtered = contactPurposes.filter((p) =>
    !search || p.label.toLowerCase().includes(search.toLowerCase())
  );

  function handleSelect(purposeId: string, label: string) {
    setLocalLabel(label);
    setPickerOpen(false);
    setSearch('');
    startSave(async () => {
      const { updateContactPurpose } = await import('@/actions/pipeline');
      await updateContactPurpose(playerId, purposeId, null);
    });
  }

  function handleCustom() {
    // Close picker — the "Outro" option would need a text input
    // For simplicity, just use the search text as custom purpose
    const customText = search.trim();
    if (!customText) return;
    setLocalLabel(customText);
    setPickerOpen(false);
    setSearch('');
    startSave(async () => {
      const { updateContactPurpose } = await import('@/actions/pipeline');
      await updateContactPurpose(playerId, null, customText);
    });
  }

  return (
    <>
      <button
        data-no-navigate
        type="button"
        onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
        disabled={isSaving}
        className={`mt-1 flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-[10px] ${
          localLabel
            ? 'bg-blue-50 font-medium text-blue-700 hover:bg-blue-100'
            : 'bg-neutral-50 text-muted-foreground hover:bg-neutral-100'
        }`}
      >
        <span className="line-clamp-2 text-left">{localLabel || 'Objetivo do contacto…'}</span>
        <ChevronsUpDown className="ml-auto h-2.5 w-2.5 shrink-0 opacity-50" />
      </button>
      <CommandDialog open={pickerOpen} onOpenChange={(v) => { setPickerOpen(v); if (!v) setSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
        <CommandInput
          placeholder="Pesquisar objetivo…"
          value={search}
          onValueChange={setSearch}
          onClear={() => setSearch('')}
        />
        <CommandList>
          <CommandEmpty>
            {search.trim() ? (
              <button
                type="button"
                onClick={handleCustom}
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
              >
                Usar &quot;{search.trim()}&quot; como objetivo
              </button>
            ) : (
              'Sem resultados'
            )}
          </CommandEmpty>
          <CommandGroup heading="Objetivos">
            {filtered.map((p) => (
              <CommandItem
                key={p.id}
                value={p.label}
                onSelect={() => handleSelect(p.id, p.label)}
              >
                {p.label}
                {p.label === localLabel && <Check className="ml-auto h-4 w-4 text-blue-500" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

/* ───────────── Standby Reason Button for Em Stand-by cards ───────────── */

function StandbyReasonButton({
  playerId,
  currentReason,
}: {
  playerId: number;
  currentReason: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentReason ?? '');
  const [isSaving, startSave] = useTransition();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local draft when server state updates via realtime
  useEffect(() => { setDraft(currentReason ?? ''); }, [currentReason]);

  function handleSave() {
    if (!draft.trim()) return;
    setEditing(false);
    startSave(async () => {
      await updateStandbyReason(playerId, draft.trim());
    });
  }

  if (editing) {
    return (
      <div data-no-navigate className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="w-full resize-none rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') { setEditing(false); setDraft(currentReason ?? ''); }
          }}
        />
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => { setEditing(false); setDraft(currentReason ?? ''); }}
            className="rounded p-0.5 text-muted-foreground hover:bg-neutral-100"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={handleSave}
            className="rounded p-0.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <Check className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      data-no-navigate
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      disabled={isSaving}
      className="mt-1 flex w-full items-center gap-1.5 rounded bg-slate-50 px-2 py-1 text-left text-[10px] text-slate-600 hover:bg-slate-100"
    >
      <Pause className="h-2.5 w-2.5 shrink-0 text-slate-400" />
      <span className="flex-1">{currentReason || 'Motivo…'}</span>
      <Pencil className="h-2.5 w-2.5 shrink-0 opacity-40" />
    </button>
  );
}

/* ───────────── Pipeline Note Button — inline note on any card ───────────── */

function PipelineNoteButton({
  playerId,
  currentNote,
}: {
  playerId: number;
  currentNote: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentNote);
  const [isSaving, startSave] = useTransition();

  useEffect(() => { setDraft(currentNote); }, [currentNote]);

  function handleSave() {
    const trimmed = draft.trim();
    setEditing(false);
    // Only save if value actually changed
    if (trimmed === currentNote) return;
    startSave(async () => {
      await updatePlayer(playerId, { recruitment_notes: trimmed });
    });
  }

  // No note yet — show a small icon button only
  if (!editing && !currentNote) {
    return (
      <button
        data-no-navigate
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        disabled={isSaving}
        className="mt-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/40 hover:bg-amber-50 hover:text-amber-500"
        aria-label="Adicionar nota"
      >
        <StickyNote className="h-3 w-3" />
      </button>
    );
  }

  // Editing mode — textarea
  if (editing) {
    return (
      <div data-no-navigate className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="w-full resize-none rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 focus:border-amber-500 focus:outline-none"
          autoFocus
          placeholder="Nota rápida…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') { setEditing(false); setDraft(currentNote); }
          }}
        />
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => { setEditing(false); setDraft(currentNote); }}
            className="rounded p-0.5 text-muted-foreground hover:bg-neutral-100"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded p-0.5 text-amber-600 hover:bg-amber-100"
          >
            <Check className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  // Has note — show it, click to edit
  return (
    <button
      data-no-navigate
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      disabled={isSaving}
      className="mt-1 flex w-full items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-left text-[10px] text-amber-700 hover:bg-amber-100"
    >
      <StickyNote className="h-2.5 w-2.5 shrink-0 text-amber-400" />
      <span className="flex-1">{currentNote}</span>
    </button>
  );
}
