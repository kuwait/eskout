// src/components/pipeline/PipelineCard.tsx
// Compact player card for the abordagens Kanban/list views
// Shows name, position, club, opinion badge, scheduled dates — links to profile, has remove button
// RELEVANT FILES: src/components/common/OpinionBadge.tsx, src/components/pipeline/StatusColumn.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition, useEffect } from 'react';
import { Calendar, Check, ChevronsUpDown, FileSignature, Phone, User, Users, X } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { PlayerAvatar } from '@/components/common/PlayerAvatar';
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
import { updateTrainingDate, updateMeetingDate, updateSigningDate } from '@/actions/pipeline';
import { updatePlayer } from '@/actions/players';
import { POSITION_LABELS } from '@/lib/constants';
import type { Player, PositionCode } from '@/lib/types';

interface PipelineCardProps {
  player: Player;
  /** Show birth year on card (when viewing all age groups) */
  showBirthYear?: boolean;
  /** Open player profile popup */
  onPlayerClick?: (playerId: number) => void;
  /** Remove from abordagens callback */
  onRemove?: (playerId: number) => void;
  /** Notify parent of training/meeting date change for optimistic update */
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate', newDate: string | null) => void;
  /** Club-scoped profiles for contact assignment */
  clubMembers?: { id: string; fullName: string }[];
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

export function PipelineCard({ player, showBirthYear, onPlayerClick, onRemove, onDateChange, clubMembers = [] }: PipelineCardProps) {
  // Extract birth year from dob for display when all age groups selected
  const birthYear = showBirthYear && player.dob ? new Date(player.dob).getFullYear() : null;
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

  return (
    <>
      <div
        className="group relative select-none rounded-md border bg-white p-2.5 pr-7 shadow-sm transition-shadow hover:shadow-md"
      >
        <div
          data-player-link
          className="block w-full text-left"
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
            <p className="truncate text-sm font-medium">{player.name}</p>
          </div>
          {/* Line 2: club */}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{player.club}</p>
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

        {/* Scheduled date button — for "Vir treinar" and "Reunião Marcada" */}
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

        {/* Remove button — always visible on touch, hover on desktop */}
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1 h-5 w-5 p-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(player.id);
            }}
            aria-label={`Remover ${player.name} das abordagens`}
          >
            <X className="h-3 w-3" />
          </Button>
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

function ContactAssignButton({ player, clubMembers }: { player: Player; clubMembers: { id: string; fullName: string }[] }) {
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
