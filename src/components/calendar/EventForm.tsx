// src/components/calendar/EventForm.tsx
// Modal form for creating and editing calendar events
// Uses PlayerPickerDialog for rich player search. Syncs treino/reuniao/assinatura to pipeline.
// RELEVANT FILES: src/actions/calendar.ts, src/components/calendar/PlayerPickerDialog.tsx, src/lib/validators.ts

'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2, Loader2, UserPlus, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CalendarEvent, Player, Profile } from '@/lib/types';
import { CALENDAR_EVENT_TYPES } from '@/lib/constants';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/actions/calendar';
import { PlayerPickerDialog } from '@/components/calendar/PlayerPickerDialog';

/* ───────────── Event types that require a player and sync to pipeline ───────────── */

const PIPELINE_EVENT_TYPES = new Set(['treino', 'assinatura', 'reuniao', 'observacao']);

/* ───────────── localStorage key for remembered locations ───────────── */

const LOCATIONS_STORAGE_KEY = 'eskout_calendar_locations';

/** Read saved locations from localStorage */
function getSavedLocations(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCATIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

/** Save a new location to localStorage (deduped, max 20) */
function saveLocation(location: string) {
  if (!location.trim()) return;
  const existing = getSavedLocations();
  const trimmed = location.trim();
  if (existing.includes(trimmed)) return;
  const updated = [trimmed, ...existing].slice(0, 20);
  localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(updated));
}

/* ───────────── Props ───────────── */

interface EventFormProps {
  event: CalendarEvent | null; // null = creating new
  prefillDate: string | null;
  profiles: Profile[];
  allPlayers: Player[];
  onClose: () => void;
}

/* ───────────── Component ───────────── */

export function EventForm({ event, prefillDate, profiles, allPlayers, onClose }: EventFormProps) {
  const router = useRouter();
  const isEditing = !!event;
  // Synthetic events (from pipeline dates) have negative IDs — saving them creates a new calendar event
  const isSyntheticEvent = !!event && event.id < 0;
  const [isPending, startTransition] = useTransition();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);

  // Form state
  const [title, setTitle] = useState(event?.title ?? '');
  const [eventType, setEventType] = useState<string>(event?.eventType ?? 'outro');
  const [eventDate, setEventDate] = useState(event?.eventDate ?? prefillDate ?? '');
  const [eventTime, setEventTime] = useState(event?.eventTime?.slice(0, 5) ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  // Selected player
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(
    event?.playerId ? allPlayers.find((p) => p.id === event.playerId) ?? null : null
  );
  // Assignee: either a user ID or free-text name
  const [assigneeMode, setAssigneeMode] = useState<'user' | 'text'>(
    event?.assigneeUserId ? 'user' : 'text'
  );
  const [assigneeUserId, setAssigneeUserId] = useState(event?.assigneeUserId ?? '');
  const [assigneeName, setAssigneeName] = useState(event?.assigneeName ?? '');

  // Saved locations from localStorage (lazy initializer avoids useEffect)
  const [savedLocations] = useState(() => getSavedLocations());
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  // Location suggestions filtered by current input
  const locationSuggestions = useMemo(() => {
    if (!location.trim()) return savedLocations;
    const q = location.toLowerCase();
    return savedLocations.filter((l) => l.toLowerCase().includes(q));
  }, [savedLocations, location]);

  // Player is required for non-"outro" event types
  const playerRequired = PIPELINE_EVENT_TYPES.has(eventType);
  // This event type syncs to pipeline (abordagens)
  const syncsToPipeline = PIPELINE_EVENT_TYPES.has(eventType) && eventType !== 'observacao';
  // Title is only user-editable for "outro" (lembrete) events
  const showTitleField = eventType === 'outro';

  /* ───────────── Submit ───────────── */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!eventDate) {
      toast.error('Data é obrigatória');
      return;
    }
    if (playerRequired && !selectedPlayer) {
      toast.error('Jogador é obrigatório para este tipo de evento');
      return;
    }
    if (showTitleField && !title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    // Auto-generate title for non-"outro" events from type label + player name
    const resolvedTitle = showTitleField
      ? title.trim()
      : `${CALENDAR_EVENT_TYPES.find((t) => t.value === eventType)?.labelPt ?? eventType}${selectedPlayer ? ` — ${selectedPlayer.name}` : ''}`;

    const resolvedAssigneeUserId = assigneeMode === 'user' && assigneeUserId && assigneeUserId !== 'none'
      ? assigneeUserId : undefined;

    // Save location to localStorage for future suggestions
    if (location.trim()) saveLocation(location.trim());

    const formData = {
      eventType,
      title: resolvedTitle,
      eventDate,
      eventTime: eventTime || undefined,
      location: location.trim(),
      notes: notes.trim(),
      playerId: selectedPlayer?.id,
      assigneeUserId: resolvedAssigneeUserId,
      assigneeName: assigneeMode === 'text'
        ? assigneeName.trim()
        : profiles.find((p) => p.id === assigneeUserId)?.fullName ?? '',
    };

    startTransition(async () => {
      // Synthetic events (from pipeline dates) need to be created as real calendar events
      const shouldCreate = !isEditing || isSyntheticEvent;
      const result = shouldCreate
        ? await createCalendarEvent(formData)
        : await updateCalendarEvent(event!.id, formData);

      if (result.success) {
        toast.success(shouldCreate ? 'Evento criado' : 'Evento atualizado');
        router.refresh();
        onClose();
      } else {
        toast.error(result.error ?? 'Erro ao guardar evento');
      }
    });
  }

  /* ───────────── Delete ───────────── */

  function handleDelete() {
    if (!event) return;
    startTransition(async () => {
      const result = await deleteCalendarEvent(event.id);
      if (result.success) {
        toast.success('Evento eliminado');
        router.refresh();
        onClose();
      } else {
        toast.error(result.error ?? 'Erro ao eliminar evento');
      }
    });
  }

  return (
    <>
      {/* ───────────── Overlay ───────────── */}
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-t-xl bg-white p-4 sm:rounded-xl sm:p-6 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ───────────── Header ───────────── */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              {isEditing ? 'Editar Evento' : 'Novo Evento'}
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* ───────────── Form ───────────── */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title — only for "outro" (lembrete) events */}
            {showTitleField && (
              <div>
                <Label htmlFor="event-title">Título *</Label>
                <Input
                  id="event-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Ligar ao João Silva às 11h"
                  autoFocus
                />
              </div>
            )}

            {/* Type + Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="event-type">Tipo</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger id="event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALENDAR_EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.labelPt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="event-date">Data *</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
            </div>

            {/* Time + Location row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="event-time">Hora</Label>
                <Input
                  id="event-time"
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                />
              </div>
              <div className="relative">
                <Label htmlFor="event-location">Local</Label>
                <Input
                  id="event-location"
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); setShowLocationSuggestions(true); }}
                  onFocus={() => setShowLocationSuggestions(true)}
                  onBlur={() => { setTimeout(() => setShowLocationSuggestions(false), 150); }}
                  placeholder="Ex: Bessa"
                  autoComplete="off"
                />
                {/* Location suggestions dropdown */}
                {showLocationSuggestions && locationSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-md max-h-32 overflow-y-auto">
                    {locationSuggestions.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50 truncate"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setLocation(loc); setShowLocationSuggestions(false); }}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ───────────── Player selector ───────────── */}
            <div>
              <Label>
                Jogador {playerRequired ? '*' : '(opcional)'}
              </Label>
              {selectedPlayer ? (
                // Show selected player card
                <div className="mt-1 flex items-center justify-between rounded-md border bg-neutral-50 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{selectedPlayer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedPlayer.club}
                      {selectedPlayer.positionNormalized ? ` · ${selectedPlayer.positionNormalized}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowPlayerPicker(true)}
                    >
                      Alterar
                    </Button>
                    {!playerRequired && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-neutral-400"
                        onClick={() => setSelectedPlayer(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                // Show "select player" button
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'mt-1 w-full justify-start font-normal',
                    playerRequired && 'border-dashed'
                  )}
                  onClick={() => setShowPlayerPicker(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4 text-neutral-400" />
                  Pesquisar e selecionar jogador...
                </Button>
              )}
            </div>

            {/* Pipeline sync info */}
            {syncsToPipeline && selectedPlayer && (
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <p className="text-xs text-blue-700">
                  Este evento vai atualizar as Abordagens do jogador automaticamente
                  {eventType === 'treino' && ' (estado: Vir Treinar + data de treino)'}
                  {eventType === 'reuniao' && ' (estado: Reunião Marcada + data de reunião)'}
                  {eventType === 'assinatura' && ' (estado: Confirmado + data de assinatura)'}
                  .
                </p>
              </div>
            )}

            {/* Assignee */}
            <div>
              <Label>Responsável (opcional)</Label>
              {/* Mode toggle */}
              <div className="mt-1 mb-2 flex gap-2">
                <Button
                  type="button"
                  variant={assigneeMode === 'user' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setAssigneeMode('user')}
                >
                  Utilizador
                </Button>
                <Button
                  type="button"
                  variant={assigneeMode === 'text' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setAssigneeMode('text')}
                >
                  Nome livre
                </Button>
              </div>
              {assigneeMode === 'user' ? (
                <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar utilizador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem responsável</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={assigneeName}
                  onChange={(e) => setAssigneeName(e.target.value)}
                  placeholder="Ex: Rúben Andrade"
                />
              )}
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="event-notes">Notas</Label>
              <Textarea
                id="event-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Informações adicionais..."
                rows={2}
              />
            </div>

            {/* ───────────── Actions ───────────── */}
            <div className="flex items-center justify-between pt-2">
              {/* Delete (only when editing a real event, not synthetic pipeline events) */}
              {isEditing && !isSyntheticEvent && !showDeleteConfirm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Eliminar
                </Button>
              )}
              {isEditing && !isSyntheticEvent && showDeleteConfirm && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">Confirmar?</span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-7"
                    onClick={handleDelete}
                    disabled={isPending}
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Não
                  </Button>
                </div>
              )}
              {!isEditing && <div />}

              {/* Save / Cancel */}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Guardar' : 'Criar'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ───────────── Player Picker Dialog ───────────── */}
      <PlayerPickerDialog
        open={showPlayerPicker}
        onOpenChange={setShowPlayerPicker}
        allPlayers={allPlayers}
        selectedId={selectedPlayer?.id}
        onSelect={(player) => setSelectedPlayer(player)}
        onClear={playerRequired ? undefined : () => setSelectedPlayer(null)}
      />
    </>
  );
}
