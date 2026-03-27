// src/components/players/PlayerProfile.tsx
// Full player profile — photo, all sections open, editable fields, notes, history
// All sections visible by default (no collapsible). Edit mode toggles inline editing.
// RELEVANT FILES: src/app/jogadores/[id]/page.tsx, src/components/players/ObservationNotes.tsx, src/components/players/StatusHistory.tsx

'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, Check, Clock, Eye, Camera, Footprints, GitBranchPlus, Loader2, Pencil, Phone, Printer, Ruler, Share2, Shirt, Trash2, User, Weight, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// Card components used by other pages — Section below uses custom layout
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ObservationBadge } from '@/components/common/ObservationBadge';
import { PlayingUpBadge } from '@/components/common/PlayingUpBadge';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { MiniPitch, PitchCanvas } from '@/components/common/MiniPitch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RefreshPlayerButton } from '@/components/players/RefreshPlayerButton';
import { ObservationNotes, AddNoteButton } from '@/components/players/ObservationNotes';
import { StatusHistory } from '@/components/players/StatusHistory';
import { ScoutingReports } from '@/components/players/ScoutingReports';
import { QuickReportCard } from '@/components/players/QuickReportCard';
import { QuickReportForm } from '@/components/players/QuickReportForm';
import { ManualReportForm } from '@/components/players/ManualReportForm';
import { PlayerClubHistory } from '@/components/players/PlayerClubHistory';
import { TrainingFeedbackList } from '@/components/players/TrainingFeedback';
import { PlayerVideos } from '@/components/players/PlayerVideos';
import {
  POSITION_LABELS,
  NATIONALITIES,
  FOOT_LABEL_MAP,
  OBSERVER_DECISIONS,
  getNationalityFlag,
  getPositionLabel,
} from '@/lib/constants';
import { updatePlayer, deletePlayer, approvePlayer, rejectPlayer, deleteStatusHistoryEntry } from '@/actions/players';
import { updateRecruitmentStatus } from '@/actions/pipeline';
import { autoScrapePlayer } from '@/actions/scraping';
import { fetchZzProfileClient } from '@/lib/zerozero/client';
import { ListBookmarkDropdown } from '@/components/players/ListBookmarkDropdown';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { usePresence } from '@/hooks/usePresence';

/* ───────────── Extracted sub-components ───────────── */
import { RATING_COLOR_MAP, RATING_DEFAULT, shortenName, formatDate } from '@/components/players/profile-utils';
import { Section, EditField, InfoChip, DECISION_BADGE_STYLES, DECISION_DEFAULT_STYLE, JerseySvg } from '@/components/players/ProfileViewSections';
import { DateInput, FootSelector, ShirtNumberInput, LinkCard, OpinionEditPills, ReferralPicker, ContactAssignPicker, EditPitchPicker } from '@/components/players/ProfileFormWidgets';
import { RecruitmentCard } from '@/components/players/RecruitmentCard';
import { DeleteConfirmDialog } from '@/components/players/DeleteConfirmDialog';

import type {
  Player,
  PlayerVideo,
  PositionCode,
  Squad,
  SquadPlayer,
  UserRole,
  ObservationNote,
  StatusHistoryEntry,
  DepartmentOpinion,
  ObserverDecision,
  ScoutEvaluation,
  ScoutingReport,
  QuickScoutReport,
  TrainingFeedback,
} from '@/lib/types';

interface PlayerProfileProps {
  player: Player;
  userRole: UserRole;
  notes?: ObservationNote[];
  statusHistory?: StatusHistoryEntry[];
  scoutingReports?: ScoutingReport[];
  scoutEvaluations?: ScoutEvaluation[];
  quickReports?: QuickScoutReport[];
  trainingFeedback?: TrainingFeedback[];
  playerVideos?: PlayerVideo[];
  currentUserId?: string | null;
  /** If provided, "Voltar" calls this instead of router.back() */
  onClose?: () => void;
  /** Age group name (e.g. "Sub-17") for display in squad badge */
  ageGroupName?: string | null;
  /** Club-scoped profiles for referral/contact assign dropdowns */
  clubMembers?: { id: string; fullName: string }[];
  /** Custom squads this player belongs to (from squad_players table) */
  playerSquads?: (SquadPlayer & { squad: Squad & { ageGroupName?: string | null } })[];
  /** FPF competitions where player competed above natural age group */
  fpfPlayingUp?: { competitionEscalao: string; expectedBirthYearEnd: number; games: number; goals: number; minutes: number }[];
  /** ZZ playing-up result (computed server-side to avoid hydration mismatch) */
  zzPlayingUp?: import('@/lib/utils/playing-up').PlayingUpResult;
  /** Auto-open QSR form with match context (from scouting game target link) */
  qsrAutoOpen?: { competition?: string; opponent?: string; matchDate?: string; gameId?: number };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- _scoutEvaluations kept for future structured evaluations
export function PlayerProfile({ player, userRole, notes = [], statusHistory = [], scoutingReports = [], scoutEvaluations: _scoutEvaluations = [], quickReports = [], trainingFeedback = [], playerVideos = [], currentUserId = null, onClose, ageGroupName, clubMembers = [], playerSquads = [], fpfPlayingUp = [], zzPlayingUp, qsrAutoOpen }: PlayerProfileProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(player);
  // After save, keep showing draft values until server refresh delivers fresh props
  const [savedDraft, setSavedDraft] = useState<typeof player | null>(null);
  // Track last synced updatedAt to detect when server delivers fresh data
  const [lastSyncedAt, setLastSyncedAt] = useState(player.updatedAt);

  /* Render-time sync: when server delivers fresh player data (new updatedAt),
     update draft and clear savedDraft. React recommended pattern — no useEffect needed.
     Fixes both: (1) profile showing stale data after save, (2) edit form showing old values */
  if (player.updatedAt !== lastSyncedAt) {
    setLastSyncedAt(player.updatedAt);
    setDraft(player);
    setSavedDraft(null);
  }
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showQuickReportForm, setShowQuickReportForm] = useState(!!qsrAutoOpen);
  const [quickReportDirty, setQuickReportDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showManualReportForm, setShowManualReportForm] = useState(false);
  const [manualReportDirty, setManualReportDirty] = useState(false);
  const [showDiscardManualConfirm, setShowDiscardManualConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPitchPopup, setShowPitchPopup] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [isAddingToPipeline, startPipeline] = useTransition();
  const [historyEntries, setHistoryEntries] = useState(statusHistory);
  const profileRef = useRef<HTMLDivElement>(null);
  const isAdmin = userRole === 'admin';
  const isRecruiter = userRole === 'recruiter';
  const isScout = userRole === 'scout';
  // Scouts see no scouting intelligence at all (opinion, decision, reports, notes)
  const hideScoutingData = isScout;
  // Both scouts and recruiters cannot see star ratings / report ratings
  const hideEvaluations = isRecruiter || isScout;
  // All roles can edit basic info; scouting fields restricted in handleSave
  const canEdit = !isScout;

  // Detect unsaved changes by comparing draft to original player
  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(player), [draft, player]);

  // Club-scoped profiles for referral/contact assign dropdowns (passed from server)
  const profiles = clubMembers;

  /* ───────────── Realtime: refresh when other users modify this player ───────────── */

  const { pageEditors } = usePresence({
    page: `/jogadores/${player.id}`,
    editing,
  });

  // Refresh server data when another user modifies this player (skip if editing to avoid losing unsaved changes)
  useRealtimeTable('players', {
    enabled: !editing,
    onAny: (event) => {
      if (event.id === player.id) router.refresh();
    },
  });

  // Also refresh on notes, evaluations, status_history changes for this player
  useRealtimeTable('observation_notes', { onAny: () => router.refresh() });
  useRealtimeTable('scout_evaluations', { onAny: () => router.refresh() });
  useRealtimeTable('status_history', { onAny: () => router.refresh() });

  /* ───────────── Lists bookmark ───────────── */
  const canObserve = true; // All roles can submit QSRs and bookmark
  const canManagePipeline = !isScout; // Scouts can't add to pipeline

  /* ───────────── Add to Pipeline ───────────── */
  function handleAddToPipeline() {
    startPipeline(async () => {
      const res = await updateRecruitmentStatus(player.id, 'por_tratar');
      if (res.success) {
        toast.success('Jogador adicionado à pipeline');
        router.refresh();
      } else {
        toast.error(res.error || 'Erro ao adicionar à pipeline');
      }
    });
  }

  function handleEdit() {
    setDraft(player);
    setEditing(true);
  }

  function handleCancel() {
    setDraft(player);
    setEditing(false);
  }

  function handleSave() {
    startTransition(async () => {
      // Basic fields — all roles can edit these
      const updates: Record<string, unknown> = {
        name: draft.name,
        dob: draft.dob,
        club: draft.club,
        position_normalized: draft.positionNormalized || null,
        secondary_position: draft.secondaryPosition || null,
        tertiary_position: draft.tertiaryPosition || null,
        foot: draft.foot || null,
        nationality: draft.nationality || null,
        shirt_number: draft.shirtNumber || null,
        contact: draft.contact || null,
        height: draft.height || null,
        weight: draft.weight || null,
        photo_url: draft.photoUrl || null,
        fpf_link: draft.fpfLink || null,
        zerozero_link: draft.zerozeroLink || null,
      };
      // Scouting intelligence fields — everyone except scouts
      if (!isScout) {
        updates.department_opinion = draft.departmentOpinion.length > 0 ? draft.departmentOpinion : [];
        updates.observer = draft.observer || null;
        updates.observer_eval = draft.observerEval || null;
        updates.observer_decision = draft.observerDecision || null;
        updates.referred_by = draft.referredBy || null;
        updates.referred_by_user_id = draft.referredByUserId || null;
        updates.recruitment_status = draft.recruitmentStatus;
        updates.recruitment_notes = draft.recruitmentNotes || null;
        updates.contact_assigned_to = draft.contactAssignedTo || null;
      }
      const result = await updatePlayer(player.id, updates);
      if (result.success) {
        // Keep draft values visible until server refresh delivers fresh props
        setSavedDraft({ ...draft });
        setEditing(false);
        // Refresh server data so status history and updated fields show immediately
        router.refresh();
        // Auto-scrape if external links changed
        const fpfChanged = (draft.fpfLink || '') !== (player.fpfLink || '');
        const zzChanged = (draft.zerozeroLink || '') !== (player.zerozeroLink || '');
        if (fpfChanged || zzChanged) {
          // Fetch ZZ client-side via Edge proxy when ZZ link changed
          let preZzProfile: import('@/lib/zerozero/parser').ZzParsedProfile | null | undefined = undefined;
          if (zzChanged && draft.zerozeroLink) {
            try {
              preZzProfile = await fetchZzProfileClient(draft.zerozeroLink);
            } catch {
              preZzProfile = null;
            }
          }
          try {
            const scrapeResult = await autoScrapePlayer(player.id, fpfChanged, zzChanged, preZzProfile);
            if (scrapeResult.errors.length > 0) {
              toast.warning(scrapeResult.errors.join('. '), { duration: 6000 });
            }
          } catch {
            toast.warning('Erro ao atualizar dados externos. Tente usar "Atualizar" manualmente.', { duration: 6000 });
          }
          // Refresh again after scrape to show updated external data
          router.refresh();
        }
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deletePlayer(player.id);
      if (result.success) {
        toast.success('Jogador eliminado');
        router.push('/jogadores');
      } else {
        toast.error(result.error ?? 'Erro ao eliminar jogador');
      }
    });
  }

  function updateDraft<K extends keyof Player>(key: K, value: Player[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // Data source for rendering (draft while editing, savedDraft after save until refresh, player otherwise)
  const p = editing ? draft : (savedDraft ?? player);

  /** Capture the profile as a canvas (shared by export & print) */
  async function captureProfile(): Promise<HTMLCanvasElement | null> {
    if (!profileRef.current) return null;
    const el = profileRef.current;
    const prevMaxWidth = el.style.maxWidth;
    const prevOverflow = el.style.overflow;
    const originals: { img: HTMLImageElement; src: string; srcset: string }[] = [];

    try {
      const html2canvas = (await import('html2canvas-pro')).default;

      // Convert ALL images to inline data URLs before capture.
      // External images use server-side proxy (/api/image-proxy) to bypass CORS.
      // Same-origin images (/_next/image) are fetched directly.
      const imgs = el.querySelectorAll('img');
      for (const img of Array.from(imgs)) {
        if (!img.src || img.src.startsWith('data:')) continue;
        try {
          let dataUrl: string;
          const isSameOrigin = img.src.startsWith(window.location.origin) || img.src.startsWith('/');

          if (isSameOrigin) {
            const res = await fetch(img.src);
            if (!res.ok) continue;
            const blob = await res.blob();
            dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } else {
            const proxyRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(img.src)}`);
            if (!proxyRes.ok) continue;
            const json = await proxyRes.json();
            dataUrl = json.dataUrl;
          }

          originals.push({ img, src: img.src, srcset: img.srcset });
          img.srcset = '';
          img.src = dataUrl;
          await img.decode().catch(() => {});
        } catch { /* skip images that fail */ }
      }

      el.style.maxWidth = 'none';
      el.style.overflow = 'visible';
      el.style.padding = '24px';

      // Hide toolbar buttons during capture
      const hiddenEls = el.querySelectorAll<HTMLElement>('[data-export-hide]');
      hiddenEls.forEach((h) => { h.style.display = 'none'; });

      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      hiddenEls.forEach((h) => { h.style.display = ''; });
      el.style.padding = '';

      return canvas;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Capture failed:', msg, err);
      return null;
    } finally {
      const el = profileRef.current!;
      el.style.maxWidth = prevMaxWidth;
      el.style.overflow = prevOverflow;
      originals.forEach(({ img, src, srcset }) => { img.src = src; img.srcset = srcset; });
    }
  }

  async function handleExportImage() {
    const canvas = await captureProfile();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${p.name.replace(/\s+/g, '_')}_ficha.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handlePrint() {
    const canvas = await captureProfile();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    // Open a new window with just the image and trigger print
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>${p.name} — Ficha</title>
      <style>
        * { margin: 0; padding: 0; }
        body { display: flex; justify-content: center; align-items: flex-start; }
        img { max-width: 100%; max-height: 100vh; width: auto; height: auto; object-fit: contain; }
        @media print {
          @page { margin: 0; }
          body { padding: 24px; }
          img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
        }
      </style>
      </head><body>
      <img src="${dataUrl}" onload="window.print();window.close()" />
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div ref={profileRef} className="mx-auto max-w-5xl space-y-3">
      {/* Presence banner — shows who else is viewing/editing this player */}
      {pageEditors.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            {pageEditors.map((p) => p.userName).join(', ')} está a editar este jogador
          </span>
        </div>
      )}

      {/* Action bar — back + contextual actions */}
      <div data-export-hide className="flex items-center justify-between rounded-xl border bg-neutral-50/50 px-2 py-1.5 shadow-sm sm:px-3">
        {/* Left side — back (view) or cancel (edit) */}
        <button
          onClick={editing ? handleCancel : (onClose ?? (() => router.back()))}
          disabled={editing ? isDeleting : false}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground hover:shadow-sm disabled:opacity-50"
        >
          {editing ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          <span className="hidden sm:inline">{editing ? 'Cancelar' : 'Voltar'}</span>
        </button>
        {/* Right side — view mode actions */}
        {!editing && (
          <div className="flex items-center gap-1">
            {/* Lists bookmark dropdown — admin/editor/recruiter */}
            {canObserve && (
              <>
                <ListBookmarkDropdown playerId={player.id} />
                <div className="mx-0.5 h-4 w-px bg-neutral-200" />
              </>
            )}
            {/* Share hidden for scouts */}
            {!hideScoutingData && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground hover:shadow-sm" title="Partilhar">
                      <Share2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Partilhar</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportImage}>
                      <Camera className="mr-2 h-3.5 w-3.5" />
                      Guardar imagem
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePrint}>
                      <Printer className="mr-2 h-3.5 w-3.5" />
                      Imprimir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="mx-0.5 h-4 w-px bg-neutral-200" />
              </>
            )}
            {!isScout && <RefreshPlayerButton player={player} />}
            {/* Add to pipeline — only when player is NOT already in pipeline */}
            {canManagePipeline && !p.recruitmentStatus && (
              <>
                <div className="mx-0.5 h-4 w-px bg-neutral-200" />
                <button
                  onClick={handleAddToPipeline}
                  disabled={isAddingToPipeline}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground hover:shadow-sm disabled:opacity-50"
                  title="Iniciar recrutamento"
                >
                  {isAddingToPipeline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranchPlus className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Recrutar</span>
                </button>
              </>
            )}
            {canEdit && (
              <>
                <div className="mx-0.5 h-4 w-px bg-neutral-200" />
                <button onClick={handleEdit} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground hover:shadow-sm">
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Editar</span>
                </button>
              </>
            )}
          </div>
        )}
        {/* Right side — edit mode: save */}
        {editing && (
          <button onClick={handleSave} disabled={!hasChanges || isPending || isDeleting} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${hasChanges ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-neutral-200 bg-neutral-50 text-neutral-400'} disabled:cursor-default`}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin text-green-500" /> : <Check className={`h-3 w-3 ${hasChanges ? 'text-green-500' : 'text-neutral-300'}`} />}
            Guardar
          </button>
        )}
      </div>

      {/* ───────────── Pending approval banner ───────────── */}
      {p.pendingApproval && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <Clock className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="flex-1 text-xs font-medium text-amber-700">
            Jogador pendente de aprovação
          </p>
          {(isAdmin || userRole === 'editor') && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => {
                  startTransition(async () => {
                    const res = await approvePlayer(p.id);
                    if (res.success) { toast.success('Jogador aprovado'); router.refresh(); }
                    else toast.error(res.error);
                  });
                }}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                Aprovar
              </button>
              <button
                onClick={() => {
                  if (!confirm('Rejeitar e eliminar este jogador?')) return;
                  startTransition(async () => {
                    const res = await rejectPlayer(p.id);
                    if (res.success) { toast.success('Jogador rejeitado'); router.back(); }
                    else toast.error(res.error);
                  });
                }}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Rejeitar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ───────────── Header with Photo (view mode only) ───────────── */}
      {!editing && <div className="flex gap-4">
        {/* Photo + MiniPitch + positions — defines header height */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          {(() => {
            const photoSrc = p.photoUrl || p.zzPhotoUrl;
            return photoSrc ? (
              <Image
                src={photoSrc}
                alt={p.name}
                width={120}
                height={120}
                className="h-28 w-28 rounded-lg border object-cover sm:h-32 sm:w-32"
                unoptimized
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-lg border bg-neutral-100 sm:h-32 sm:w-32">
                <User className="h-14 w-14 text-neutral-400" />
              </div>
            );
          })()}
          {/* MiniPitch + positions below photo — mobile/tablet only */}
          {!editing && p.positionNormalized && (
            <div className="flex flex-col items-center gap-1 xl:hidden">
              <div
                className="cursor-pointer"
                onClick={() => setShowPitchPopup(true)}
                role="button"
                tabIndex={0}
                title="Ver campo maior"
              >
                <PitchCanvas
                  primaryPosition={p.positionNormalized as PositionCode}
                  secondaryPosition={p.secondaryPosition as PositionCode | null}
                  tertiaryPosition={p.tertiaryPosition as PositionCode | null}
                  size="sm"
                  className="h-[75px] w-28 sm:h-[85px] sm:w-32"
                />
              </div>
              {/* Position badges below pitch */}
              <div className="flex flex-wrap justify-center gap-1">
                <span className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                  {p.positionNormalized}
                </span>
                {p.secondaryPosition && (
                  <span className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400" />
                    {p.secondaryPosition}
                  </span>
                )}
                {p.tertiaryPosition && (
                  <span className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
                    {p.tertiaryPosition}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 xl:gap-2">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-bold xl:text-2xl" style={{ fontSize: 'clamp(1rem, 4.5vw, 1.5rem)' }}>{shortenName(p.name)}</h1>
              {/* Bookmark icon is now inside the ListBookmarkDropdown in the header */}
              {!hideScoutingData && <ObservationBadge player={p} showLabel />}
            </div>
          {/* Club — hidden on mobile header (shown in Info Básica + Percurso) */}
          {/* Positions row — hidden on mobile (shown under MiniPitch instead) */}
          <div className="hidden flex-wrap items-center gap-2 text-sm xl:flex">
            {p.positionNormalized && (
              <span className="flex items-center gap-1.5 rounded bg-neutral-100 px-2 py-0.5 font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="Principal" />
                {p.positionNormalized} — {POSITION_LABELS[p.positionNormalized as PositionCode]}
              </span>
            )}
            {p.secondaryPosition && (
              <span className="flex items-center gap-1.5 rounded bg-neutral-100 px-2 py-0.5 font-medium text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" title="Secundária" />
                {p.secondaryPosition}
              </span>
            )}
            {p.tertiaryPosition && (
              <span className="flex items-center gap-1.5 rounded bg-neutral-100 px-2 py-0.5 font-medium text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-400" title="Terciária" />
                {p.tertiaryPosition}
              </span>
            )}
            {!hideScoutingData && <OpinionBadge opinion={p.departmentOpinion} variant="compact" />}
          </div>
          {/* Playing up badge — own line below positions, hidden for scouts */}
          {!isScout && (
            <div className="self-start">
              <PlayingUpBadge player={p} showLabel fpfEntries={fpfPlayingUp} zzResult={zzPlayingUp} />
            </div>
          )}
          {/* Opinion badge — mobile only */}
          {!hideScoutingData && p.departmentOpinion && (Array.isArray(p.departmentOpinion) ? p.departmentOpinion.length > 0 : !!p.departmentOpinion) && (
            <div className="xl:hidden">
              <OpinionBadge opinion={p.departmentOpinion} variant="compact" />
            </div>
          )}
          {/* Rating removed — Quick Reports replace "A tua avaliação" */}
        </div>

        {/* ───────────── Mini pitch + Rating widget (right side, desktop) ───────────── */}
        {!editing && p.positionNormalized && (
          <div className="hidden shrink-0 self-center xl:block">
            <MiniPitch
              primaryPosition={p.positionNormalized as PositionCode}
              secondaryPosition={p.secondaryPosition as PositionCode | null}
              tertiaryPosition={p.tertiaryPosition as PositionCode | null}
            />
          </div>
        )}
        {/* Desktop rating widget — aggregated from all evaluation sources (hidden for recruiter + scout) */}
        {!editing && !isRecruiter && !isScout && (() => {
          const pdfReports = scoutingReports.filter(r => (r.extractionStatus === 'success' || r.extractionStatus === 'partial') && r.rating !== null);
          const allHeaderRatings = [
            ...quickReports.map(qr => qr.ratingOverall),
            ...pdfReports.map(r => r.rating!),
          ];
          if (allHeaderRatings.length === 0) return null;
          const avg = allHeaderRatings.reduce((a, b) => a + b, 0) / allHeaderRatings.length;
          const colorKey = Math.ceil(avg) || 1;
          const c = RATING_COLOR_MAP[colorKey] ?? RATING_DEFAULT;
          return (
            <div className={`hidden shrink-0 self-center xl:flex h-24 w-20 flex-col items-center justify-center rounded-2xl ${c.bg} border ${c.border}`}>
              <span className={`text-3xl font-black leading-none ${c.num}`}>{avg.toFixed(1)}</span>
              <span className={`mt-1 text-[10px] font-semibold ${c.num} opacity-70`}>{allHeaderRatings.length} {allHeaderRatings.length === 1 ? 'aval.' : 'avals.'}</span>
            </div>
          );
        })()}
      </div>}

      {!editing && <Separator />}

      {/* ───────────── Two-column layout on desktop, single on mobile ───────────── */}
      {/* In edit mode: redesigned form layout */}
      {editing ? (
        <div className="space-y-3">
          {/* ───────────── Edit form: two columns on desktop, single on mobile ───────────── */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* ── Left column: Dados do Jogador + Links & Foto ── */}
            <div className="space-y-3">
              {/* ───────────── Section 1: Dados do Jogador ───────────── */}
              <Section title="Dados do Jogador">
                <div className="space-y-3">
                  {/* Name — full width */}
                  <EditField label="Nome Completo">
                    <Input
                      value={draft.name}
                      onChange={(e) => updateDraft('name', e.target.value)}
                      className="text-xs font-medium tracking-wide text-neutral-600"
                      placeholder="Nome do jogador"
                    />
                  </EditField>

                  {/* DOB + Club — side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <EditField label="Nascimento">
                      <DateInput value={draft.dob ?? ''} onChange={(v) => updateDraft('dob', v)} />
                    </EditField>
                    <EditField label="Clube">
                      <div className="relative">
                        <Shirt className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                        <Input
                          value={draft.club}
                          onChange={(e) => updateDraft('club', e.target.value)}
                          className="pl-8 text-xs font-medium tracking-wide text-neutral-600"
                          placeholder="Clube"
                        />
                      </div>
                    </EditField>
                  </div>

                  {/* Nationality + Número — side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <EditField label="Nacionalidade">
                      <Select value={draft.nationality || 'none'} onValueChange={(v) => updateDraft('nationality', v === 'none' ? null : v)}>
                        <SelectTrigger className="w-full text-xs font-medium tracking-wide text-neutral-600">
                          <SelectValue>
                            {draft.nationality ? `${getNationalityFlag(draft.nationality)} ${draft.nationality}` : '—'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {NATIONALITIES.map((n) => (
                            <SelectItem key={n.value} value={n.value}>{n.flag} {n.value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </EditField>
                    <EditField label="Número">
                      <ShirtNumberInput value={draft.shirtNumber} onChange={(v) => updateDraft('shirtNumber', v)} />
                    </EditField>
                  </div>

                  {/* Foot + Contact — side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <EditField label="Pé">
                      <FootSelector
                        value={draft.foot}
                        onChange={(v) => updateDraft('foot', v)}
                      />
                    </EditField>
                    <EditField label="Contacto">
                      <Input
                        type="text"
                        value={draft.contact}
                        onChange={(e) => updateDraft('contact', e.target.value)}
                        placeholder="Telefone, email, etc."
                        className="text-xs font-medium tracking-wide text-neutral-600"
                      />
                    </EditField>
                  </div>

                  {/* Altura + Peso — side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <EditField label="Altura (cm)">
                      <div className="relative">
                        <Ruler className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                        <Input
                          type="number"
                          min={0}
                          max={250}
                          value={draft.height ?? ''}
                          onChange={(e) => updateDraft('height', e.target.value ? Number(e.target.value) : null)}
                          placeholder="Ex: 175"
                          className="pl-8 text-xs font-medium tracking-wide text-neutral-600"
                        />
                      </div>
                    </EditField>
                    <EditField label="Peso (kg)">
                      <div className="relative">
                        <Weight className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                        <Input
                          type="number"
                          min={0}
                          max={200}
                          value={draft.weight ?? ''}
                          onChange={(e) => updateDraft('weight', e.target.value ? Number(e.target.value) : null)}
                          placeholder="Ex: 70"
                          className="pl-8 text-xs font-medium tracking-wide text-neutral-600"
                        />
                      </div>
                    </EditField>
                  </div>
                </div>
              </Section>

              {/* ───────────── Section 4: Links & Foto ───────────── */}
              <Section title="Links & Foto">
                <div className="space-y-2.5">
                  {/* Photo */}
                  <LinkCard
                    icon={draft.photoUrl ? (
                      <Image src={draft.photoUrl} alt="Foto" width={36} height={36} className="h-full w-full rounded object-cover" unoptimized />
                    ) : (
                      <Camera className="h-4 w-4 text-neutral-400" />
                    )}
                    label="Foto"
                    value={draft.photoUrl ?? ''}
                    onChange={(v) => updateDraft('photoUrl', v || null)}
                    isImage
                  />

                  {/* FPF */}
                  <LinkCard
                    icon={<Image src="https://upload.wikimedia.org/wikipedia/pt/7/75/Portugal_FPF.png" alt="FPF" width={20} height={20} className="h-5 w-5 object-contain" unoptimized />}
                    label="Portal FPF"
                    value={draft.fpfLink}
                    onChange={(v) => updateDraft('fpfLink', v)}
                  />

                  {/* ZeroZero */}
                  <LinkCard
                    icon={<Image src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Zerozero-logo.svg/1280px-Zerozero-logo.svg.png" alt="ZeroZero" width={20} height={20} className="h-5 w-5 object-contain" unoptimized />}
                    label="ZeroZero"
                    value={draft.zerozeroLink}
                    onChange={(v) => updateDraft('zerozeroLink', v)}
                  />
                </div>
              </Section>
            </div>

            {/* ── Right column: Posição + Observação & Recrutamento ── */}
            <div className="space-y-3">
              {/* ───────────── Section 2: Posição ───────────── */}
              <Section title="Posição">
                <div className="flex flex-col items-center justify-center gap-2">
                  <EditPitchPicker
                    primary={draft.positionNormalized as PositionCode | ''}
                    secondary={draft.secondaryPosition as PositionCode | null}
                    tertiary={draft.tertiaryPosition as PositionCode | null}
                    onPrimaryChange={(v) => updateDraft('positionNormalized', v as PositionCode)}
                    onSecondaryChange={(v) => updateDraft('secondaryPosition', v)}
                    onTertiaryChange={(v) => updateDraft('tertiaryPosition', v)}
                  />
                  <div className="flex items-center gap-3 text-[10px] font-medium text-neutral-400">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Principal</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" /> Secundária</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" /> Terciária</span>
                  </div>
                </div>
              </Section>

              {/* ───────────── Section 3: Observação & Recrutamento (hidden from scouts) ───────────── */}
              {!isScout && <Section title="Observação & Recrutamento">
                <div className="space-y-4">
                  <EditField label="Referência">
                    <ReferralPicker
                      profiles={profiles}
                      selectedUserId={draft.referredByUserId}
                      freeText={draft.referredBy}
                      onChange={(userId, name) => {
                        setDraft((d) => ({ ...d, referredByUserId: userId, referredBy: name }));
                      }}
                    />
                  </EditField>

                  {/* Decisão — segmented pill buttons */}
                  <EditField label="Decisão">
                    <div className="flex flex-wrap gap-1.5">
                      {OBSERVER_DECISIONS.map((d) => {
                        const isSelected = draft.observerDecision === d;
                        const decStyle = DECISION_BADGE_STYLES[d] ?? DECISION_DEFAULT_STYLE;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => updateDraft('observerDecision', (draft.observerDecision === d ? '' : d) as ObserverDecision)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                              isSelected
                                ? `${decStyle.bg} ${decStyle.border} ${decStyle.text} shadow-sm`
                                : 'border-dashed border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-500'
                            }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </EditField>

                  {/* Opinião Departamento — colored toggle pills */}
                  <EditField label="Opinião Departamento">
                    <OpinionEditPills
                      selected={draft.departmentOpinion}
                      onChange={(next) => updateDraft('departmentOpinion', next as DepartmentOpinion[])}
                    />
                  </EditField>

                  {/* Responsável pelo contacto — user picker */}
                  <EditField label="Responsável Contacto">
                    <ContactAssignPicker
                      profiles={profiles}
                      selectedUserId={draft.contactAssignedTo}
                      onChange={(userId) => setDraft((d) => ({ ...d, contactAssignedTo: userId }))}
                    />
                  </EditField>
                </div>
              </Section>}
            </div>
          </div>

          {/* ───────────── Danger zone — delete (admin only) ───────────── */}
          {isAdmin && (
            <div className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-red-600">Zona de perigo</p>
                  <p className="mt-0.5 text-xs text-red-500/70">Eliminar permanentemente este jogador e todos os dados associados.</p>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isPending || isDeleting}
                  className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          )}
          <div className="h-5" />

        </div>
      ) : (
        /* ───────────── View mode: two columns on lg ───────────── */
        /* Mobile order: Avaliação → Info Básica → Observação → Notas → Recrutamento → Histórico */
        <>
        {/* Aggregate rating bar removed — Quick Reports replace ScoutEvaluations */}

        <div className="mt-3 flex flex-col gap-3 lg:mt-0 lg:grid lg:grid-cols-2">
          {/* ── Col Left (desktop): Info, Observação, Notas ── */}
          <div className="order-1 space-y-3 lg:order-none">
            <Section
              title="Informação Básica"
              action={
                /* FPF/ZZ icon links in section title */
                (p.fpfLink || p.zerozeroLink) ? (
                  <div className="flex gap-1">
                    {p.fpfLink && (
                      <a href={p.fpfLink} target="_blank" rel="noopener noreferrer" className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:bg-neutral-50" title="FPF">
                        <Image src="https://upload.wikimedia.org/wikipedia/pt/7/75/Portugal_FPF.png" alt="FPF" width={16} height={16} className="h-4 w-4 object-contain" unoptimized />
                      </a>
                    )}
                    {p.zerozeroLink && (
                      <a href={p.zerozeroLink} target="_blank" rel="noopener noreferrer" className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:bg-neutral-50" title="ZeroZero">
                        <Image src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Zerozero-logo.svg/1280px-Zerozero-logo.svg.png" alt="ZeroZero" width={16} height={16} className="h-4 w-4 object-contain" unoptimized />
                      </a>
                    )}
                  </div>
                ) : undefined
              }
            >
              <div className="grid grid-cols-2 gap-1.5">
                {/* Full name — always shown in basic info */}
                {p.name && (
                  <div className="col-span-2">
                    <InfoChip icon={<User className="h-3.5 w-3.5" />} label="Nome completo" value={p.name} />
                  </div>
                )}
                {p.dob && (
                  <InfoChip icon={<Calendar className="h-3.5 w-3.5" />} label="Nascimento" value={formatDate(p.dob)} />
                )}
                {p.club && (
                  <Link href={`/?clube=${encodeURIComponent(p.club)}`} className="flex items-center gap-2.5 rounded-lg bg-neutral-50/80 px-2.5 py-2 transition-colors hover:bg-neutral-100/80">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white shadow-sm ring-1 ring-neutral-200/60">
                      {p.clubLogoUrl ? (
                        <Image src={p.clubLogoUrl} alt={p.club} width={18} height={18} className="h-[18px] w-[18px] object-contain" unoptimized />
                      ) : (
                        <Shirt className="h-3.5 w-3.5 text-neutral-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Clube</p>
                      <p className="line-clamp-2 font-semibold leading-snug" style={{ fontSize: 'clamp(0.65rem, 3vw, 0.875rem)' }}>{p.club}</p>
                    </div>
                  </Link>
                )}
                {p.shirtNumber && (
                  <InfoChip icon={<JerseySvg number={p.shirtNumber} className="h-5 w-4 text-neutral-700" />} label="Número" value={String(p.shirtNumber)} />
                )}
                {p.foot && (
                  <InfoChip icon={<Footprints className="h-3.5 w-3.5" />} label="Pé" value={FOOT_LABEL_MAP[p.foot] ?? p.foot} />
                )}
                {p.height && (
                  <InfoChip icon={<Ruler className="h-3.5 w-3.5" />} label="Altura" value={`${p.height} cm`} />
                )}
                {p.weight && (
                  <InfoChip icon={<Weight className="h-3.5 w-3.5" />} label="Peso" value={`${p.weight} kg`} />
                )}
                {p.nationality && (
                  <InfoChip icon={<span className="text-sm leading-none">{getNationalityFlag(p.nationality)}</span>} label="Nacionalidade" value={p.nationality} href={`/?nacionalidade=${encodeURIComponent(p.nationality)}`} />
                )}
                {p.birthCountry && (
                  <InfoChip icon={<span className="text-sm leading-none">{getNationalityFlag(p.birthCountry)}</span>} label="País Nasc." value={p.birthCountry} />
                )}
                {!isScout && p.contact && (
                  <InfoChip icon={<Phone className="h-3.5 w-3.5" />} label="Contacto" value={p.contact} wrap />
                )}
                {!isScout && p.referredBy && (
                  <InfoChip icon={<User className="h-3.5 w-3.5" />} label="Referência" value={p.referredBy} linked={!!p.referredByUserId} wrap />
                )}
              </div>
            </Section>

            {/* Percurso — mobile only (desktop version in right column) */}
            {(p.zzTeamHistory || p.zzCurrentClub || p.zzCurrentTeam) && (
              <div className="lg:hidden">
                <Section title="Percurso">
                  <PlayerClubHistory
                    zzTeamHistory={p.zzTeamHistory}
                    zzCurrentClub={p.zzCurrentClub}
                    zzCurrentTeam={p.zzCurrentTeam}
                    zzGamesSeason={p.zzGamesSeason}
                    zzGoalsSeason={p.zzGoalsSeason}
                    zzLastChecked={p.zzLastChecked}
                    dob={p.dob}
                  />
                </Section>
              </div>
            )}

            {/* Media — YouTube videos, hidden for scouts */}
            {!isScout && <Section title="Media">
              <PlayerVideos
                playerId={p.id}
                videos={playerVideos}
                userRole={userRole}
                currentUserId={currentUserId}
              />
            </Section>}

            {/* Scout's own QSRs + add button — visible even when hideScoutingData is true */}
            {hideScoutingData && (() => {
              const myQsrs = quickReports.filter(qr => qr.authorId === currentUserId);
              return (
                <Section
                  title="As minhas avaliações"
                  action={
                    <button type="button" onClick={() => setShowQuickReportForm(true)} className="text-xs font-medium text-primary hover:underline">
                      + Avaliar
                    </button>
                  }
                >
                  {myQsrs.length > 0 ? (
                    <div className="space-y-1.5">
                      {myQsrs.map(qr => (
                        <QuickReportCard
                          key={`qr-${qr.id}`}
                          report={qr}
                          canDelete={true}
                          onDelete={() => router.refresh()}
                          defaultExpanded
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="py-2 text-center text-xs text-muted-foreground">Sem avaliações. Clica em &quot;+ Avaliar&quot; para adicionar.</p>
                  )}
                  {/* QSR Dialog for scouts */}
                  <Dialog
                    open={showQuickReportForm}
                    onOpenChange={(open) => {
                      if (!open && quickReportDirty) { setShowDiscardConfirm(true); }
                      else { setShowQuickReportForm(open); if (!open) setQuickReportDirty(false); }
                    }}
                  >
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onInteractOutside={(e) => { if (quickReportDirty) e.preventDefault(); }}>
                      <DialogHeader>
                        <DialogTitle>Avaliar {p.name.split(' ').slice(0, 2).join(' ')}</DialogTitle>
                      </DialogHeader>
                      <QuickReportForm
                        playerId={p.id}
                        playerName={p.name}
                        isGoalkeeper={p.positionNormalized === 'GR'}
                        initialMatchContext={qsrAutoOpen}
                        onSuccess={() => { setShowQuickReportForm(false); setQuickReportDirty(false); router.refresh(); }}
                        onCancel={() => {
                          if (quickReportDirty) { setShowDiscardConfirm(true); }
                          else { setShowQuickReportForm(false); }
                        }}
                        onDirtyChange={setQuickReportDirty}
                      />
                    </DialogContent>
                  </Dialog>
                </Section>
              );
            })()}

            {/* Observação — unified evaluation section */}
            {!hideScoutingData && (() => {
              const extractedReports = scoutingReports.filter(r => r.extractionStatus === 'success' || r.extractionStatus === 'partial');
              const hasObservation = !hideEvaluations; // always show for "+ Avaliar"
              if (!hasObservation) return null;

              // Aggregate rating from all sources
              const allRatings: number[] = [
                ...quickReports.map(qr => qr.ratingOverall),
                ...extractedReports.filter(r => r.rating !== null).map(r => r.rating!),
              ];
              const avgRating = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : null;

              return (
                <Section
                  title="Observação"
                  action={
                    avgRating !== null ? (
                      <span className="text-xs text-muted-foreground">
                        <span className="font-bold text-neutral-700">{avgRating.toFixed(1)}</span> · {allRatings.length} {allRatings.length === 1 ? 'aval.' : 'avals.'}
                      </span>
                    ) : undefined
                  }
                >
                  {!hideEvaluations && (
                    <div className="space-y-4">
                      {/* Quick Report Form Dialog — blocks dismiss when dirty */}
                      <Dialog
                        open={showQuickReportForm}
                        onOpenChange={(open) => {
                          if (!open && quickReportDirty) {
                            setShowDiscardConfirm(true);
                          } else {
                            setShowQuickReportForm(open);
                            if (!open) setQuickReportDirty(false);
                          }
                        }}
                      >
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onInteractOutside={(e) => { if (quickReportDirty) e.preventDefault(); }}>
                          <DialogHeader>
                            <DialogTitle>Avaliar {p.name.split(' ').slice(0, 2).join(' ')}</DialogTitle>
                          </DialogHeader>
                          <QuickReportForm
                            playerId={p.id}
                            playerName={p.name}
                            isGoalkeeper={p.positionNormalized === 'GR'}
                            initialMatchContext={qsrAutoOpen}
                            onSuccess={() => { setShowQuickReportForm(false); setQuickReportDirty(false); router.refresh(); }}
                            onCancel={() => {
                              if (quickReportDirty) { setShowDiscardConfirm(true); }
                              else { setShowQuickReportForm(false); }
                            }}
                            onDirtyChange={setQuickReportDirty}
                          />
                        </DialogContent>
                      </Dialog>
                      {/* Discard confirmation */}
                      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Descartar avaliação?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tens dados preenchidos que serão perdidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Continuar a editar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => { setShowQuickReportForm(false); setQuickReportDirty(false); }}
                              className="bg-red-600 text-white hover:bg-red-700"
                            >
                              Descartar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      {/* All evaluations in a single list */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-muted-foreground">
                              Avaliações Rápidas ({quickReports.length})
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowQuickReportForm(true)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              + Avaliar
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {quickReports.map(qr => (
                              <QuickReportCard
                                key={`qr-${qr.id}`}
                                report={qr}
                                canDelete={currentUserId === qr.authorId || userRole === 'admin'}
                                onDelete={() => router.refresh()}
                              />
                            ))}
                          </div>
                          <ScoutingReports
                            reports={scoutingReports}
                            reportLabels={p.reportLabels}
                            reportLinks={p.reportLinks}
                            currentUserId={currentUserId}
                            userRole={userRole}
                            onDelete={() => router.refresh()}
                            action={
                              <button
                                type="button"
                                onClick={() => setShowManualReportForm(true)}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                + Relatório
                              </button>
                            }
                          />
                          {/* Manual Report Form Dialog */}
                          <Dialog
                            open={showManualReportForm}
                            onOpenChange={(open) => {
                              if (!open && manualReportDirty) {
                                setShowDiscardManualConfirm(true);
                              } else {
                                setShowManualReportForm(open);
                                if (!open) setManualReportDirty(false);
                              }
                            }}
                          >
                            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onInteractOutside={(e) => { if (manualReportDirty) e.preventDefault(); }}>
                              <DialogHeader>
                                <DialogTitle>Relatório — {p.name.split(' ').slice(0, 2).join(' ')}</DialogTitle>
                              </DialogHeader>
                              <ManualReportForm
                                playerId={p.id}
                                playerName={p.name}
                                onSuccess={() => { setShowManualReportForm(false); setManualReportDirty(false); router.refresh(); }}
                                onCancel={() => {
                                  if (manualReportDirty) { setShowDiscardManualConfirm(true); }
                                  else { setShowManualReportForm(false); }
                                }}
                                onDirtyChange={setManualReportDirty}
                              />
                            </DialogContent>
                          </Dialog>
                          {/* Discard manual report confirmation */}
                          <AlertDialog open={showDiscardManualConfirm} onOpenChange={setShowDiscardManualConfirm}>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Descartar relatório?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tens dados preenchidos que serão perdidos.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Continuar a editar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => { setShowManualReportForm(false); setManualReportDirty(false); }}
                                  className="bg-red-600 text-white hover:bg-red-700"
                                >
                                  Descartar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                    </div>
                  )}
                </Section>
              );
            })()}

            {!hideEvaluations && (
            <Section
              title="Notas de Observação"
              action={<AddNoteButton onClick={() => setShowNoteForm(true)} />}
            >
              <ObservationNotes
                playerId={player.id}
                notes={notes}
                showForm={showNoteForm}
                onShowFormChange={setShowNoteForm}
                canEdit={canEdit}
              />
            </Section>
            )}
          </div>

          {/* Right column: Avaliação (desktop), Recrutamento, Histórico */}
          <div className="order-2 space-y-3 lg:order-none">
            {/* Scout evaluations removed — Quick Reports replace ScoutEvaluations */}

            {/* Percurso — desktop only (mobile version in left column) */}
            {(p.zzTeamHistory || p.zzCurrentClub || p.zzCurrentTeam) && (
              <div className="hidden lg:block">
                <Section title="Percurso">
                  <PlayerClubHistory
                    zzTeamHistory={p.zzTeamHistory}
                    zzCurrentClub={p.zzCurrentClub}
                    zzCurrentTeam={p.zzCurrentTeam}
                    zzGamesSeason={p.zzGamesSeason}
                    zzGoalsSeason={p.zzGoalsSeason}
                    zzLastChecked={p.zzLastChecked}
                    dob={p.dob}
                  />
                </Section>
              </div>
            )}

            {/* Recrutamento — hidden when completely empty, visible to recruiters */}
            {!isScout && (p.recruitmentStatus || p.isRealSquad || p.isShadowSquad || p.trainingDate || p.meetingDate || p.signingDate || p.recruitmentNotes) && <Section title="Recrutamento">
              {(() => {
                // Find when player entered current recruitment status
                const statusEntry = statusHistory.find(
                  (e) => e.fieldChanged === 'recruitment_status' && e.newValue === p.recruitmentStatus
                );
                const daysInStatus = statusEntry ? Math.floor((Date.now() - new Date(statusEntry.createdAt).getTime()) / 86400000) : null;
                // Find when added to squads
                const realSquadEntry = p.isRealSquad
                  ? statusHistory.find((e) => e.fieldChanged === 'is_real_squad' && e.newValue === 'true')
                  : null;
                const shadowSquadEntry = p.isShadowSquad
                  ? statusHistory.find((e) => e.fieldChanged === 'is_shadow_squad' && e.newValue === 'true')
                  : null;

                return (
                  <div className="space-y-3">
                    {/* Status card with description */}
                    {p.recruitmentStatus && (
                      <RecruitmentCard
                        status={p.recruitmentStatus}
                        daysInStatus={daysInStatus}
                        contactAssignedToName={p.contactAssignedToName}
                        trainingDate={p.trainingDate}
                        meetingDate={p.meetingDate}
                        signingDate={p.signingDate}
                        meetingAttendees={p.meetingAttendees}
                        signingAttendees={p.signingAttendees}
                        profiles={profiles}
                        selectedUserId={p.contactAssignedTo}
                        playerId={player.id}
                        canAssign={!isScout}
                      />
                    )}

                    {/* Squad cards — show custom squad memberships if available, fall back to legacy badges */}
                    {playerSquads.length > 0 ? (
                      <>
                        {playerSquads.map((sp) => {
                          const isReal = sp.squad.squadType === 'real';
                          return (
                            <div
                              key={sp.id}
                              className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                                isReal
                                  ? 'border-green-200 bg-green-50/60'
                                  : 'border-purple-200 bg-purple-50/60'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full ${isReal ? 'bg-green-500' : 'bg-purple-500'}`} />
                                  <span className={`text-sm font-semibold ${isReal ? 'text-green-800' : 'text-purple-800'}`}>
                                    {isReal
                                      ? `Plantel - ${sp.squad.name}`
                                      : `Plantel Sombra${sp.squad.ageGroupName ? ` - ${sp.squad.ageGroupName}` : ''} ${sp.squad.name}`
                                    }
                                  </span>
                                </div>
                                {sp.position && (
                                  <p className={`mt-0.5 pl-4 text-xs ${isReal ? 'text-green-700' : 'text-purple-700'}`}>
                                    Posição: <span className="font-bold">{getPositionLabel(sp.position)}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        {p.isRealSquad && (
                          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50/60 px-3 py-2.5">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                <span className="text-sm font-semibold text-green-800">
                                  Atleta do Plantel{ageGroupName ? ` ${ageGroupName}` : ''}
                                </span>
                              </div>
                              {p.realSquadPosition && (
                                <p className="mt-0.5 pl-4 text-xs text-green-700">
                                  Posição: <span className="font-bold">{getPositionLabel(p.realSquadPosition)}</span>
                                </p>
                              )}
                            </div>
                            {realSquadEntry && (
                              <span className="text-[11px] text-muted-foreground">
                                desde {new Date(realSquadEntry.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        )}
                        {p.isShadowSquad && (
                          <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2.5">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-purple-500" />
                                <span className="text-sm font-semibold text-purple-800">Plantel Sombra</span>
                              </div>
                              {p.shadowPosition && (
                                <p className="mt-0.5 pl-4 text-xs text-purple-700">
                                  Posição: <span className="font-bold">{getPositionLabel(p.shadowPosition)}</span>
                                </p>
                              )}
                            </div>
                            {shadowSquadEntry && (
                              <span className="text-[11px] text-muted-foreground">
                                desde {new Date(shadowSquadEntry.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}


                    {/* Notes */}
                    {p.recruitmentNotes && (
                      <div className="rounded-md border bg-neutral-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Notas</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{p.recruitmentNotes}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </Section>}

            {/* ───────────── Training Feedback (Treinos) ───────────── */}
            {!isScout && (
              <Section title="Treinos no Clube">
                <TrainingFeedbackList
                  playerId={player.id}
                  entries={trainingFeedback}
                  userRole={userRole}
                  defaultEscalao={p.trainingEscalao}
                  currentUserName={clubMembers.find((m) => m.id === currentUserId)?.fullName}
                  currentUserId={currentUserId}
                />
              </Section>
            )}

            {!isScout && historyEntries.length > 0 && (() => {
              // StatusHistory deduplicates internally — check if any entries survive filtering
              const hasVisible = historyEntries.some((e, i) => {
                const oldNorm = (e.oldValue ?? '').trim();
                const newNorm = (e.newValue ?? '').trim();
                const emptyVals = ['', '[]', '—'];
                if (emptyVals.includes(oldNorm) && emptyVals.includes(newNorm)) return false;
                if (oldNorm === newNorm) return false;
                if (i === 0) return true;
                const prev = historyEntries[i - 1];
                return !(e.fieldChanged === prev.fieldChanged && e.oldValue === prev.oldValue && e.newValue === prev.newValue);
              });
              if (!hasVisible) return null;
              return (
                <Section title="Histórico">
                  <StatusHistory
                    entries={historyEntries}
                    canDelete={isAdmin}
                    onDelete={(entryId) => {
                      setHistoryEntries((prev) => prev.filter((e) => e.id !== entryId));
                      deleteStatusHistoryEntry(entryId).then((res) => {
                        if (!res.success) setHistoryEntries(statusHistory);
                      });
                    }}
                  />
                </Section>
              );
            })()}

            {/* ───────────── Profile completeness — progress + actionable suggestions ───────────── */}
            {(() => {
              // Core fields — count toward progress bar
              const core = [
                { done: !!p.dob, label: 'Data nascimento' },
                { done: !!p.club, label: 'Clube' },
                { done: !!p.positionNormalized, label: 'Posição' },
                { done: !!p.foot, label: 'Pé preferido' },
                { done: !!p.nationality, label: 'Nacionalidade' },
              ];
              // Optional — shown as suggestions but don't affect progress
              const optional = [
                { done: !!p.fpfLink, label: 'Link FPF' },
                { done: !!p.zerozeroLink, label: 'Link ZeroZero' },
              ];
              const done = core.filter((c) => c.done).length;
              const total = core.length;
              const pct = Math.round((done / total) * 100);
              const missingCore = core.filter((c) => !c.done);
              const missingOptional = optional.filter((c) => !c.done);
              const missing = [...missingCore, ...missingOptional];
              // Hide when nothing to suggest
              if (missing.length === 0) return null;
              // Hide progress bar when core is 100% (only optional suggestions remain)
              const showBar = missingCore.length > 0;
              // Color based on completeness
              const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
              const textColor = pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500';
              return (
                <div className="rounded-lg border bg-neutral-50/50 px-3 py-3">
                  {/* Progress header + bar (only when core fields are incomplete) */}
                  {showBar && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Perfil</span>
                        <span className={`text-xs font-bold ${textColor}`}>{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  )}
                  {!showBar && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sugestões</span>
                  )}
                  {/* Missing items as clickable chips */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {missing.map((m) => (
                      <button
                        key={m.label}
                        type="button"
                        onClick={() => { setDraft(player); setEditing(true); }}
                        className="rounded-full border border-dashed border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        + {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        </>
      )}

      {/* Delete confirmation dialog — requires typing ELIMINAR to unlock */}
      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        playerName={player.name}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
      />

      {/* MiniPitch enlarged popup (mobile click-to-expand) */}
      {p.positionNormalized && (
        <Dialog open={showPitchPopup} onOpenChange={setShowPitchPopup}>
          <DialogContent className="flex max-w-sm items-center justify-center border-0 bg-transparent p-2 shadow-none [&>button]:hidden">
            <DialogTitle className="sr-only">Posições no campo</DialogTitle>
            <PitchCanvas
              primaryPosition={p.positionNormalized as PositionCode}
              secondaryPosition={p.secondaryPosition as PositionCode | null}
              tertiaryPosition={p.tertiaryPosition as PositionCode | null}
              size="lg"
              className="h-56 w-full max-w-[340px]"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* MiniPitch and PitchCanvas imported from @/components/common/MiniPitch */
