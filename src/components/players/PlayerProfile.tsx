// src/components/players/PlayerProfile.tsx
// Full player profile — photo, all sections open, editable fields, notes, history
// All sections visible by default (no collapsible). Edit mode toggles inline editing.
// RELEVANT FILES: src/app/jogadores/[id]/page.tsx, src/components/players/ObservationNotes.tsx, src/components/players/StatusHistory.tsx

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Calendar, Check, ChevronsUpDown, CircleCheckBig, Clock, Eye, Camera, Flag, Footprints, Handshake, Loader2, MessageCircle, Pencil, PenLine, Phone, Printer, Ruler, Save, Share2, Shirt, Trash2, User, Weight, X, XCircle } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
// Card components used by other pages — Section below uses custom layout
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ObservationBadge } from '@/components/common/ObservationBadge';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ClubBadge } from '@/components/common/ClubBadge';
import { MiniPitch, PitchCanvas } from '@/components/common/MiniPitch';
import {
  Dialog as PitchDialog,
  DialogContent as PitchDialogContent,
  DialogTitle as PitchDialogTitle,
} from '@/components/ui/dialog';
import { RefreshPlayerButton } from '@/components/players/RefreshPlayerButton';
import { ObservationNotes, AddNoteButton } from '@/components/players/ObservationNotes';
import { StatusHistory } from '@/components/players/StatusHistory';
import { ScoutEvaluations } from '@/components/players/ScoutEvaluations';
import { ScoutingReports } from '@/components/players/ScoutingReports';
import {
  POSITION_LABELS,
  POSITIONS,
  DEPARTMENT_OPINIONS,
  FOOT_OPTIONS,
  FOOT_LABEL_MAP,
  OBSERVER_DECISIONS,
  RECRUITMENT_STATUSES,
  RECRUITMENT_LABEL_MAP,
  NATIONALITIES,
  getNationalityFlag,
  getPositionLabel,
} from '@/lib/constants';
import { updatePlayer, deletePlayer, approvePlayer, rejectPlayer } from '@/actions/players';
import { autoScrapePlayer } from '@/actions/scraping';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { usePresence } from '@/hooks/usePresence';
import type {
  Player,
  PositionCode,
  UserRole,
  ObservationNote,
  StatusHistoryEntry,
  DepartmentOpinion,
  Foot,
  ObserverDecision,
  RecruitmentStatus,
  ScoutEvaluation,
  ScoutingReport,
} from '@/lib/types';

interface PlayerProfileProps {
  player: Player;
  userRole: UserRole;
  notes?: ObservationNote[];
  statusHistory?: StatusHistoryEntry[];
  scoutingReports?: ScoutingReport[];
  scoutEvaluations?: ScoutEvaluation[];
  currentUserId?: string | null;
  /** If provided, "Voltar" calls this instead of router.back() */
  onClose?: () => void;
  /** Age group name (e.g. "Sub-17") for display in squad badge */
  ageGroupName?: string | null;
}

export function PlayerProfile({ player, userRole, notes = [], statusHistory = [], scoutingReports = [], scoutEvaluations = [], currentUserId = null, onClose, ageGroupName }: PlayerProfileProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(player);
  // After save, keep showing draft values until server refresh delivers fresh props
  const [savedDraft, setSavedDraft] = useState<typeof player | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPitchPopup, setShowPitchPopup] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const profileRef = useRef<HTMLDivElement>(null);
  const isAdmin = userRole === 'admin';
  const isRecruiter = userRole === 'recruiter';
  const isScout = userRole === 'scout';
  // Scouts and recruiters have restricted view — no scouting intelligence
  const isRestricted = isRecruiter || isScout;
  // All roles can edit basic info; scouting fields restricted in handleSave
  const canEdit = true;

  // Detect unsaved changes by comparing draft to original player
  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(player), [draft, player]);

  // Profiles list for referral combobox — fetched once when entering edit mode
  const [profiles, setProfiles] = useState<{ id: string; fullName: string }[]>([]);

  // Clear savedDraft when server delivers fresh props (after router.refresh())
  useEffect(() => {
    setSavedDraft(null);
  }, [player]);

  // Hybrid rating from player (pre-computed: report ratings + scout evaluations)
  const hybridAvgRating = player.reportAvgRating;
  const hybridRatingCount = player.reportRatingCount;

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

  function handleEdit() {
    setDraft(player);
    setEditing(true);
    // Fetch profiles for referral combobox (lazy — only when editing)
    if (profiles.length === 0) {
      const supabase = createClient();
      supabase.from('profiles').select('id, full_name').order('full_name').then(({ data }) => {
        if (data) setProfiles(data.map((p) => ({ id: p.id, fullName: p.full_name })));
      });
    }
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
          const scrapeResult = await autoScrapePlayer(player.id, fpfChanged, zzChanged);
          if (scrapeResult.errors.length > 0) {
            toast.warning(scrapeResult.errors.join('. '), { duration: 6000 });
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
        router.push('/jogadores');
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
            {/* Share hidden for scouts/recruiters */}
            {!isRestricted && (
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
            <RefreshPlayerButton player={player} />
            {canEdit && (
              <button onClick={handleEdit} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground hover:shadow-sm">
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Editar</span>
              </button>
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
            <div className="flex items-baseline gap-2">
              <h1 className="truncate font-bold xl:text-2xl" style={{ fontSize: 'clamp(1rem, 4.5vw, 1.5rem)' }}>{shortenName(p.name)}</h1>
              {!isRestricted && <ObservationBadge player={p} showLabel />}
            </div>
          {/* Club — mobile only (desktop shows in Info Básica) */}
          {!editing && p.club && (
            <div className="xl:hidden">
              <ClubBadge club={p.club} logoUrl={p.clubLogoUrl} size="sm" />
            </div>
          )}
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
            {!isRestricted && <OpinionBadge opinion={p.departmentOpinion} variant="compact" />}
          </div>
          {/* Opinion badge — mobile only */}
          {!isRestricted && p.departmentOpinion && (Array.isArray(p.departmentOpinion) ? p.departmentOpinion.length > 0 : !!p.departmentOpinion) && (
            <div className="xl:hidden">
              <OpinionBadge opinion={p.departmentOpinion} variant="compact" />
            </div>
          )}
          {/* My rating — mobile only, fills remaining header height defined by left column */}
          {!editing && !isRecruiter && (
            <div className="min-h-0 flex-1 overflow-hidden xl:hidden">
              <ScoutEvaluations
                playerId={p.id}
                evaluations={scoutEvaluations}
                currentUserId={currentUserId}
                reportRatings={scoutingReports.filter((r) => r.rating !== null).map((r) => ({ rating: r.rating!, scoutName: r.scoutName }))}
                part="personal"
                className="flex h-full w-full items-center justify-center"
                compact
              />
            </div>
          )}
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
        {/* Desktop rating widget — tall card matching MiniPitch height (hidden for recruiter) */}
        {!editing && !isRecruiter && (hybridAvgRating !== null || p.observerEval) && (() => {
          const primaryValue = hybridAvgRating ?? (p.observerEval ? parseRating(p.observerEval).rating : 0);
          const primaryInt = Math.round(primaryValue);
          const c = RATING_COLOR_MAP[primaryInt] ?? RATING_DEFAULT;
          const isAvg = hybridAvgRating !== null;
          const displayValue = isAvg ? hybridAvgRating.toFixed(1) : String(primaryValue);
          const label = isAvg ? `${hybridRatingCount} aval.` : (p.observerEval ? parseRating(p.observerEval).ratingText : '');
          return (
            <div className={`hidden shrink-0 self-center xl:flex h-24 w-20 flex-col items-center justify-center rounded-2xl ${c.bg} border ${c.border}`}>
              <span className={`text-3xl font-black leading-none ${c.num}`}>{displayValue}</span>
              {label && <span className={`mt-1 text-[10px] font-semibold ${c.num} opacity-70`}>{label}</span>}
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
        {/* Aggregate rating bar — mobile only, above the grid (hidden for recruiter) */}
        {!isRestricted && <div className="xl:hidden">
          <ScoutEvaluations
            playerId={p.id}
            evaluations={scoutEvaluations}
            currentUserId={currentUserId}
            reportRatings={scoutingReports.filter((r) => r.rating !== null).map((r) => ({ rating: r.rating!, scoutName: r.scoutName }))}
            part="team"
          />
        </div>}

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
                {/* Full name — spans both columns when name was shortened in header */}
                {p.name.trim().split(/\s+/).length > 2 && (
                  <div className="col-span-2">
                    <InfoChip icon={<User className="h-3.5 w-3.5" />} label="Nome completo" value={p.name} />
                  </div>
                )}
                {p.dob && (
                  <InfoChip icon={<Calendar className="h-3.5 w-3.5" />} label="Nascimento" value={formatDate(p.dob)} />
                )}
                {p.club && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-neutral-50/80 px-2.5 py-2">
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
                  </div>
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
                  <InfoChip icon={<span className="text-sm leading-none">{getNationalityFlag(p.nationality)}</span>} label="Nacionalidade" value={p.nationality} />
                )}
                {p.birthCountry && (
                  <InfoChip icon={<span className="text-sm leading-none">{getNationalityFlag(p.birthCountry)}</span>} label="País Nasc." value={p.birthCountry} />
                )}
                {p.contact && (
                  <InfoChip icon={<Phone className="h-3.5 w-3.5" />} label="Contacto" value={p.contact} wrap />
                )}
                {p.referredBy && (
                  <InfoChip icon={<User className="h-3.5 w-3.5" />} label="Referência" value={p.referredBy} linked={!!p.referredByUserId} wrap />
                )}
              </div>
            </Section>

            {/* Observação — scout info, decision, and reports (hidden for recruiter) */}
            {!isRestricted && (() => {
              const observerNames = p.observer ? p.observer.split(',').map((n) => n.trim()).filter(Boolean) : [];
              const hasObservation = observerNames.length > 0 || p.observerDecision || scoutingReports.length > 0 || p.reportLabels.length > 0;
              if (!hasObservation) return null;
              return (
                <Section title="Observação">
                  {(observerNames.length > 0 || p.observerDecision) && (
                    <div className="flex flex-col gap-2.5">
                      {/* Decision badge — prominent colored pill */}
                      {p.observerDecision && <DecisionBadge decision={p.observerDecision} />}
                      {/* Observers */}
                      {observerNames.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">{observerNames.length > 1 ? 'Observadores' : 'Observador'}</p>
                          <div className="space-y-1">
                            {observerNames.map((name, i) => (
                              <div key={i} className="flex items-center gap-2 rounded-lg bg-neutral-50/80 px-2.5 py-1.5">
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-bold text-neutral-600">{name.charAt(0).toUpperCase()}</div>
                                <span className="truncate text-xs font-medium" style={{ fontSize: 'clamp(0.65rem, 3vw, 0.875rem)' }}>{name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Relatórios — extracted reports or fallback to old-style links */}
                  {(scoutingReports.length > 0 || p.reportLabels.length > 0) && (
                    <div className="mt-3">
                      <ScoutingReports
                        reports={scoutingReports}
                        reportLabels={p.reportLabels}
                        reportLinks={p.reportLinks}
                      />
                    </div>
                  )}
                </Section>
              );
            })()}

            {!isRestricted && (
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
            {/* Scout evaluations — desktop only (hidden for recruiter) */}
            {!isRestricted && <div className="hidden xl:block">
              <ScoutEvaluations
                playerId={p.id}
                evaluations={scoutEvaluations}
                currentUserId={currentUserId}
                reportRatings={scoutingReports.filter((r) => r.rating !== null).map((r) => ({ rating: r.rating!, scoutName: r.scoutName }))}
              />
            </div>}

            {/* Recrutamento — hidden when completely empty, hidden for recruiter */}
            {!isRestricted && (p.recruitmentStatus || p.isRealSquad || p.isShadowSquad || p.trainingDate || p.meetingDate || p.signingDate || p.recruitmentNotes) && <Section title="Recrutamento">
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
                      <RecruitmentCard status={p.recruitmentStatus} daysInStatus={daysInStatus} trainingDate={p.trainingDate} meetingDate={p.meetingDate} signingDate={p.signingDate} />
                    )}

                    {/* Squad cards */}
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

            {!isRestricted && statusHistory.length > 0 && (
              <Section title="Histórico">
                <StatusHistory entries={statusHistory} />
              </Section>
            )}

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
        <PitchDialog open={showPitchPopup} onOpenChange={setShowPitchPopup}>
          <PitchDialogContent className="flex max-w-sm items-center justify-center border-0 bg-transparent p-2 shadow-none [&>button]:hidden">
            <PitchDialogTitle className="sr-only">Posições no campo</PitchDialogTitle>
            <PitchCanvas
              primaryPosition={p.positionNormalized as PositionCode}
              secondaryPosition={p.secondaryPosition as PositionCode | null}
              tertiaryPosition={p.tertiaryPosition as PositionCode | null}
              size="lg"
              className="h-56 w-full max-w-[340px]"
            />
          </PitchDialogContent>
        </PitchDialog>
      )}
    </div>
  );
}

/* ───────────── Delete Confirm Dialog — type ELIMINAR to unlock ───────────── */

function DeleteConfirmDialog({ open, onOpenChange, playerName, isDeleting, onConfirm }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  playerName: string;
  isDeleting: boolean;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const isUnlocked = confirmText === 'ELIMINAR';

  // Reset text when dialog opens/closes
  /* eslint-disable react-hooks/set-state-in-effect -- resets form state when dialog closes */
  useEffect(() => { if (!open) setConfirmText(''); }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar jogador?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Isto irá eliminar permanentemente <strong>{playerName}</strong> e todos os dados associados
                (notas, histórico, relatórios). Esta ação não pode ser revertida.
              </p>
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500">
                  Escreve <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-600">ELIMINAR</span> para confirmar
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="ELIMINAR"
                  className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium tracking-wider outline-none transition-colors focus:border-red-300 focus:ring-1 focus:ring-red-200 placeholder:text-neutral-300"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting || !isUnlocked}
            className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
          >
            {isDeleting ? 'A eliminar...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ───────────── Helper Components ───────────── */

function Section({ title, action, children, stretch }: { title: string; action?: React.ReactNode; children: React.ReactNode; stretch?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-3 shadow-sm ${stretch ? 'flex h-full flex-col' : ''}`}>
      {/* Title bar — accent pill + compact layout */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-1 rounded-full bg-neutral-800" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">{title}</span>
        </div>
        {action}
      </div>
      {/* Separator */}
      <div className="-mx-4 border-b" />
      {/* Content */}
      <div className={`pt-3 ${stretch ? 'flex-1' : ''}`}>{children}</div>
    </div>
  );
}

function EditField({ label, suffix, children }: { label: string; suffix?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {suffix}
      </div>
      {children}
    </div>
  );
}

/* ───────────── Foot Selector — segmented control ───────────── */

/** Segmented control for foot preference: Esquerdo | Ambidestro | Direito */
/** Date input — shows formatted date as a tappable button that opens native date picker via hidden input */
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const display = value ? formatDate(value) : '—';
  return (
    <div className="relative min-w-0">
      {/* Hidden native date input — positioned behind the visible button */}
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        tabIndex={-1}
      />
      {/* Visible tappable display */}
      <button
        type="button"
        onClick={() => ref.current?.showPicker?.()}
        className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent"
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span className={value ? 'text-xs font-medium tracking-wide text-neutral-600' : 'text-xs text-muted-foreground'}>{display}</span>
      </button>
    </div>
  );
}

/** Foot silhouette SVG — mirrored via scaleX for left foot */
function FootSvg({ side, className }: { side: 'left' | 'right'; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 48"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      style={side === 'left' ? { transform: 'scaleX(-1)' } : undefined}
    >
      {/* Simplified foot silhouette — right foot base shape */}
      <path d="M16 2c-2 0-4 1-5.5 3C9 7 8 10 8 14c0 3-.5 6-1.5 9C5 27 4 30 4 33c0 4 1.5 7 4 9 2 1.5 5 2.5 8 2.5h2c3 0 5.5-1 7.5-3 1.5-1.5 2.5-4 2.5-6.5 0-3-1-5.5-2-8-1.5-3.5-2-7-2-11 0-4-.5-7-2-9.5C20.5 3.5 18.5 2 16 2z" />
      {/* Toes */}
      <ellipse cx="8" cy="33" rx="2.5" ry="3" />
      <ellipse cx="13" cy="31.5" rx="2" ry="2.5" />
      <ellipse cx="17.5" cy="31" rx="2" ry="2.5" />
      <ellipse cx="21.5" cy="32" rx="2" ry="2.5" />
      <ellipse cx="24.5" cy="34" rx="2" ry="2.5" />
    </svg>
  );
}

/** Interactive foot selector — tap left/right foot, both = ambidextrous. Matches input field height. */
function FootSelector({ value, onChange }: { value: string; onChange: (v: Foot) => void }) {
  const isLeft = value === 'Esq' || value === 'Amb';
  const isRight = value === 'Dir' || value === 'Amb';

  function handleTap(side: 'left' | 'right') {
    if (side === 'left') {
      if (value === 'Esq') onChange('' as Foot);         // deselect left
      else if (value === 'Dir') onChange('Amb' as Foot);  // was right → both
      else if (value === 'Amb') onChange('Dir' as Foot);  // was both → just right
      else onChange('Esq' as Foot);                       // nothing → left
    } else {
      if (value === 'Dir') onChange('' as Foot);          // deselect right
      else if (value === 'Esq') onChange('Amb' as Foot);  // was left → both
      else if (value === 'Amb') onChange('Esq' as Foot);  // was both → just left
      else onChange('Dir' as Foot);                        // nothing → right
    }
  }

  // Label for current selection
  const label = value === 'Dir' ? 'Direito' : value === 'Esq' ? 'Esquerdo' : value === 'Amb' ? 'Ambidestro' : '';

  return (
    <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 shadow-sm">
      {/* Two tappable feet */}
      <div className="flex items-end gap-px">
        <button
          type="button"
          onClick={() => handleTap('left')}
          className={`rounded p-0.5 transition-all ${isLeft ? 'text-neutral-800' : 'text-neutral-300 hover:text-neutral-400'}`}
          title="Esquerdo"
        >
          <FootSvg side="left" className="h-5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleTap('right')}
          className={`rounded p-0.5 transition-all ${isRight ? 'text-neutral-800' : 'text-neutral-300 hover:text-neutral-400'}`}
          title="Direito"
        >
          <FootSvg side="right" className="h-5 w-3.5" />
        </button>
      </div>
      {/* Divider */}
      <div className="h-4 w-px bg-neutral-200" />
      {/* Label or placeholder */}
      {label
        ? <span className="text-xs font-medium tracking-wide text-neutral-600">{label}</span>
        : <span className="text-xs text-neutral-300">Escolher pé</span>
      }
    </div>
  );
}

/* ───────────── Opinion Edit Pills — colored toggle pills ───────────── */

/** Colored opinion pills for edit mode: selected shows tinted bg + solid border, unselected shows dashed border */
const OPINION_EDIT_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  '1ª Escolha':       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-300',   dot: 'bg-blue-500' },
  '2ª Escolha':       { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-300', dot: 'bg-orange-500' },
  'Acompanhar':       { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-300', dot: 'bg-yellow-500' },
  'Por Observar':     { bg: 'bg-neutral-100', text: 'text-neutral-600', border: 'border-neutral-300', dot: 'bg-neutral-400' },
  'Urgente Observar': { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-300', dot: 'bg-orange-500' },
  'Sem interesse':    { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-300',    dot: 'bg-red-500' },
  'Potencial':        { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-300', dot: 'bg-purple-500' },
  'Assinar':          { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-300',  dot: 'bg-green-500' },
};
const OPINION_EDIT_DEFAULT = { bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-200', dot: 'bg-neutral-400' };

function OpinionEditPills({ selected, onChange }: { selected: DepartmentOpinion[]; onChange: (v: DepartmentOpinion[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DEPARTMENT_OPINIONS.map((o) => {
        const checked = selected.includes(o.value);
        const s = OPINION_EDIT_STYLES[o.value] ?? OPINION_EDIT_DEFAULT;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              const next = checked
                ? selected.filter((v) => v !== o.value)
                : [...selected, o.value];
              onChange(next as DepartmentOpinion[]);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
              checked
                ? `${s.bg} ${s.border} ${s.text} shadow-sm`
                : 'border-dashed border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-500'
            }`}
          >
            {/* Colored dot — only when selected */}
            {checked && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />}
            {o.value}
          </button>
        );
      })}
    </div>
  );
}

/** Decision colors — matches ScoutingReports.tsx DECISION_STYLES */
const DECISION_BADGE_STYLES: Record<string, { icon: string; bg: string; text: string; border: string }> = {
  'Assinar':        { icon: 'text-green-600',  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  'Acompanhar':     { icon: 'text-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  'Rever':          { icon: 'text-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  'Sem Interesse':  { icon: 'text-red-500',    bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
  'Sem interesse':  { icon: 'text-red-500',    bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
};
const DECISION_DEFAULT_STYLE = { icon: 'text-neutral-400', bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-200' };

/** Colored decision badge with icon — used in Observação section */
function DecisionBadge({ decision }: { decision: string }) {
  const s = DECISION_BADGE_STYLES[decision] ?? DECISION_DEFAULT_STYLE;
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border ${s.border} ${s.bg} px-3 py-2`}>
      <CircleCheckBig className={`h-5 w-5 shrink-0 ${s.icon}`} />
      <div className="min-w-0">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Decisão</p>
        <p className={`text-sm font-bold ${s.text}`}>{decision}</p>
      </div>
    </div>
  );
}

/** Compact info chip — icon + label/value, used in Info Básica grid. wrap=true allows multi-line value */
function InfoChip({ icon, label, value, linked, wrap }: { icon: React.ReactNode; label: string; value: string; linked?: boolean; wrap?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-neutral-50/80 px-2.5 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-neutral-500 shadow-sm ring-1 ring-neutral-200/60">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">{label}</p>
        <div className="flex items-center gap-1.5">
          <p className={`${wrap ? 'line-clamp-2 text-xs' : 'truncate text-sm'} font-semibold leading-snug`}>{value}</p>
          {linked && <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[8px] font-bold text-blue-600">LINKED</span>}
        </div>
      </div>
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2">{children}</div>
  );
}

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{label}</p>
      {highlight ? (
        <p className="mt-0.5 truncate text-sm font-bold">{value}</p>
      ) : (
        <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
      )}
    </div>
  );
}

/* ───────────── Shirt Number Picker ───────────── */

/** SVG jersey silhouette (back view) with number */
function JerseySvg({ number, className }: { number?: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 130" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Main body — torso + sleeves as one smooth shape */}
      <path
        d="M36 8 L28 5 C22 3 14 8 6 18 L2 24 C0 27 0 31 2 34 L12 50 C14 53 18 54 20 52 L24 48 L22 110 C22 116 26 120 32 120 L88 120 C94 120 98 116 98 110 L96 48 L100 52 C102 54 106 53 108 50 L118 34 C120 31 120 27 118 24 L114 18 C106 8 98 3 92 5 L84 8 C78 14 66 18 60 18 C54 18 42 14 36 8 Z"
        fill="currentColor"
      />
      {/* Collar — round neckline */}
      <path
        d="M36 8 C42 14 54 18 60 18 C66 18 78 14 84 8"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />
      {/* Collar inner shadow */}
      <path
        d="M40 11 C46 15 54 17 60 17 C66 17 74 15 80 11"
        fill="none"
        stroke="white"
        strokeWidth="1"
        strokeOpacity="0.15"
        strokeLinecap="round"
      />
      {/* Left sleeve seam */}
      <path d="M24 48 L22 110" stroke="white" strokeWidth="1" strokeOpacity="0.12" />
      {/* Right sleeve seam */}
      <path d="M96 48 L98 110" stroke="white" strokeWidth="1" strokeOpacity="0.12" />
      {/* Bottom hem */}
      <path d="M32 120 L88 120" stroke="white" strokeWidth="2" strokeOpacity="0.2" strokeLinecap="round" />
      {/* Shoulder highlight (left) */}
      <path d="M28 5 C22 3 14 8 6 18" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
      {/* Shoulder highlight (right) */}
      <path d="M92 5 C98 3 106 8 114 18" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
      {/* Number on back */}
      {number && (
        <text
          x="60"
          y="78"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={number.length > 1 ? '44' : '52'}
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
          letterSpacing="-2"
        >
          {number}
        </text>
      )}
    </svg>
  );
}

/* ───────────── Link Card — compact row for URL fields (photo, FPF, ZeroZero) ───────────── */

/** Compact link row: icon + label + status. Tap to expand inline URL input.
 *  isImage: when true, validates the URL loads as an image before confirming. */
function LinkCard({ icon, label, value, onChange, isImage }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  isImage?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const hasValue = !!value;

  function normalizeUrl(raw: string): string {
    let url = raw.trim();
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    return url;
  }

  function handleConfirm() {
    const url = normalizeUrl(draft);
    if (!url || url === 'https://') return;

    if (isImage) {
      // Validate image loads before accepting
      setLoading(true);
      setStatus(null);
      const img = new window.Image();
      img.onload = () => {
        onChange(url);
        setDraft('');
        setExpanded(false);
        setLoading(false);
        setStatus(null);
      };
      img.onerror = () => {
        setLoading(false);
        setStatus('Imagem não carregou');
      };
      img.src = url;
    } else {
      onChange(url);
      setDraft('');
      setExpanded(false);
    }
  }

  function handleCancel() {
    setDraft('');
    setExpanded(false);
    setLoading(false);
    setStatus(null);
  }

  return (
    <div className={`rounded-lg border transition-colors ${
      hasValue ? 'border-green-200 bg-green-50/40' : 'border-neutral-200 bg-neutral-50/40'
    }`}>
      {/* Header — tappable to toggle input */}
      <button
        type="button"
        onClick={() => { if (!expanded) { setDraft(''); setStatus(null); setExpanded(true); } else handleCancel(); }}
        className="flex w-full items-center gap-2.5 px-3 py-2"
      >
        {/* Icon / preview */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-neutral-200/60">
          {icon}
        </div>
        {/* Label + status */}
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs font-medium text-neutral-600">{label}</p>
          <p className={`text-[10px] ${hasValue ? 'font-medium text-green-600' : 'text-neutral-400'}`}>
            {hasValue ? 'Ligado' : 'Sem link'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasValue && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Remover este link?')) onChange('');
              }}
              className="rounded-md p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Remover"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <Pencil className={`h-3 w-3 transition-colors ${expanded ? 'text-neutral-600' : 'text-neutral-300'}`} />
        </div>
      </button>
      {/* Expandable input — type URL then confirm */}
      {expanded && (
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="url"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setStatus(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') handleCancel(); }}
              placeholder={hasValue ? 'Novo URL...' : 'URL...'}
              className="min-w-0 flex-1 bg-transparent font-mono text-[9px] tracking-wider text-neutral-500 outline-none placeholder:text-neutral-300"
              autoFocus
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || !/^(https?:\/\/)?.+\..+/.test(draft.trim())}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </button>
          </div>
          {status && (
            <p className="mt-1 text-[10px] text-neutral-400">{status}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ShirtNumberInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Shirt className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="pl-8 text-xs font-medium tracking-wide text-neutral-600"
      />
    </div>
  );
}

/* ───────────── Referral Picker — combobox with profiles + free text ───────────── */

/** Combobox: select a registered user OR type free text. Clear button to remove. */
function ReferralPicker({ profiles, selectedUserId, freeText, onChange }: {
  profiles: { id: string; fullName: string }[];
  selectedUserId: string | null;
  freeText: string;
  onChange: (userId: string | null, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Display name: linked user's name, or free text
  const linkedProfile = selectedUserId ? profiles.find((p) => p.id === selectedUserId) : null;
  const displayName = linkedProfile?.fullName || freeText;
  const isLinked = !!linkedProfile;

  function handleSelectProfile(profile: { id: string; fullName: string }) {
    onChange(profile.id, profile.fullName);
    setOpen(false);
    setSearch('');
  }

  function handleFreeText() {
    if (search.trim()) {
      onChange(null, search.trim());
      setOpen(false);
      setSearch('');
    }
  }

  function handleClear() {
    onChange(null, '');
  }

  // Filtered profiles based on search
  const filtered = profiles.filter((p) => !search || p.fullName.toLowerCase().includes(search.toLowerCase()));
  const hasExactMatch = profiles.some((p) => p.fullName.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="flex items-center gap-1.5">
      {/* Trigger button — opens dialog */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 shadow-sm transition-colors hover:bg-accent"
      >
        <User className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        {displayName ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <span className="truncate text-xs font-medium tracking-wide text-neutral-600">{displayName}</span>
            {isLinked && <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-bold text-blue-600">LINKED</span>}
          </span>
        ) : (
          <span className="flex-1 text-left text-xs text-neutral-300">Quem referenciou</span>
        )}
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-neutral-300" />
      </button>
      {/* Search dialog — works well on mobile (no popover/keyboard issues) */}
      <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
        <CommandInput
          placeholder="Pesquisar utilizador ou escrever nome..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>
            {search.trim() ? (
              <button
                type="button"
                onClick={handleFreeText}
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
              >
                Adicionar <strong>&quot;{search.trim()}&quot;</strong> como referência externa
              </button>
            ) : (
              'Sem resultados'
            )}
          </CommandEmpty>
          {/* Registered users */}
          {filtered.length > 0 && (
            <CommandGroup heading="Utilizadores">
              {filtered.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.fullName}
                  onSelect={() => handleSelectProfile(p)}
                >
                  <User className="mr-2 h-4 w-4 text-neutral-400" />
                  {p.fullName}
                  {p.id === selectedUserId && <Check className="ml-auto h-4 w-4 text-blue-500" />}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {/* Free text option */}
          {search.trim() && !hasExactMatch && (
            <CommandGroup heading="Outro">
              <CommandItem onSelect={handleFreeText} value={`__free__${search}`}>
                <PenLine className="mr-2 h-4 w-4 text-neutral-400" />
                Adicionar &quot;{search.trim()}&quot;
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
      {/* Clear button */}
      {displayName && (
        <button
          type="button"
          onClick={handleClear}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input text-neutral-400 transition-colors hover:bg-accent hover:text-neutral-600"
          title="Remover referência"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ───────────── Interactive Pitch Position Picker ───────────── */

/** Position coordinates on a horizontal pitch (percentage-based) */
const EDIT_PITCH_POSITIONS: Record<PositionCode, { x: number; y: number }> = {
  GR:  { x: 8,  y: 50 },
  DD:  { x: 24, y: 82 },
  DC:  { x: 22, y: 50 },
  DE:  { x: 24, y: 18 },
  MDC: { x: 35, y: 50 },
  AD:  { x: 36, y: 88 },
  MD:  { x: 50, y: 82 },
  MC:  { x: 50, y: 50 },
  ME:  { x: 50, y: 18 },
  AE:  { x: 36, y: 12 },
  MOC: { x: 62.5, y: 50 },
  ED:  { x: 72, y: 86 },
  EE:  { x: 72, y: 14 },
  SA:  { x: 80, y: 50 },
  PL:  { x: 88, y: 50 },
};

function EditPitchPicker({ primary, secondary, tertiary, onPrimaryChange, onSecondaryChange, onTertiaryChange }: {
  primary: PositionCode | '';
  secondary: PositionCode | null;
  tertiary: PositionCode | null;
  onPrimaryChange: (v: string) => void;
  onSecondaryChange: (v: string | null) => void;
  onTertiaryChange: (v: string | null) => void;
}) {
  function handleClick(pos: PositionCode) {
    // If already selected at any level, remove it
    if (pos === primary) { onPrimaryChange(''); return; }
    if (pos === secondary) { onSecondaryChange(null); return; }
    if (pos === tertiary) { onTertiaryChange(null); return; }
    // Assign to first available slot
    if (!primary) { onPrimaryChange(pos); return; }
    if (!secondary) { onSecondaryChange(pos); return; }
    if (!tertiary) { onTertiaryChange(pos); return; }
    // All 3 filled — replace tertiary
    onTertiaryChange(pos);
  }

  function getLevel(pos: PositionCode): 'primary' | 'secondary' | 'tertiary' | null {
    if (pos === primary) return 'primary';
    if (pos === secondary) return 'secondary';
    if (pos === tertiary) return 'tertiary';
    return null;
  }

  const levelStyles = {
    primary:   'bg-green-500 border-white shadow-md shadow-green-500/40 scale-125',
    secondary: 'bg-yellow-400 border-white shadow-md shadow-yellow-400/40 scale-110',
    tertiary:  'bg-orange-400 border-white shadow-md shadow-orange-400/40 scale-110',
  };

  return (
    <div className="relative h-60 w-full max-w-md overflow-hidden rounded-lg bg-emerald-700/90">
      {/* Pitch markings */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-1.5 rounded-sm border border-white/20" />
        <div className="absolute inset-y-1.5 left-1/2 border-l border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-[25%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
        <div className="absolute left-1.5 top-1/2 h-[45%] w-[12%] -translate-y-1/2 border-y border-r border-white/20" />
        <div className="absolute left-1.5 top-1/2 h-[25%] w-[6%] -translate-y-1/2 border-y border-r border-white/20" />
        <div className="absolute right-1.5 top-1/2 h-[45%] w-[12%] -translate-y-1/2 border-y border-l border-white/20" />
        <div className="absolute right-1.5 top-1/2 h-[25%] w-[6%] -translate-y-1/2 border-y border-l border-white/20" />
      </div>
      {/* Clickable position dots */}
      {(Object.entries(EDIT_PITCH_POSITIONS) as [PositionCode, { x: number; y: number }][]).map(([pos, coords]) => {
        const level = getLevel(pos);
        return (
          <button
            key={pos}
            type="button"
            onClick={() => handleClick(pos)}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
          >
            <div className="flex flex-col items-center">
              <div className={`rounded-full border-2 transition-all ${level ? `h-5 w-5 ${levelStyles[level]}` : 'h-3 w-3 bg-white/30 border-transparent group-hover:bg-white/60 group-hover:scale-125'}`} />
              <span className={`mt-0.5 text-[9px] font-bold leading-none drop-shadow-sm transition-colors ${level ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}>{pos}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Recruitment Card — visual pipeline tracker ───────────── */

/** Pipeline steps in order (rejeitado is special — shown as end state) */
const PIPELINE_STEPS = ['por_tratar', 'a_observar', 'em_contacto', 'vir_treinar', 'reuniao_marcada', 'a_decidir', 'confirmado', 'assinou'] as const;

/** Icon + color per status */
const STATUS_VISUAL: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; ring: string }> = {
  por_tratar:      { icon: Clock,          color: 'text-neutral-500', bg: 'bg-neutral-100',   ring: 'ring-neutral-300' },
  a_observar:      { icon: Eye,            color: 'text-yellow-600',  bg: 'bg-yellow-100',    ring: 'ring-yellow-300' },
  em_contacto:     { icon: MessageCircle,  color: 'text-purple-600',  bg: 'bg-purple-100',    ring: 'ring-purple-300' },
  vir_treinar:     { icon: User,           color: 'text-blue-600',    bg: 'bg-blue-100',      ring: 'ring-blue-300' },
  reuniao_marcada: { icon: Handshake,      color: 'text-orange-600',  bg: 'bg-orange-100',    ring: 'ring-orange-300' },
  a_decidir:       { icon: Clock,          color: 'text-blue-800',    bg: 'bg-blue-100',      ring: 'ring-blue-400' },
  confirmado:      { icon: Check,          color: 'text-green-600',   bg: 'bg-green-100',     ring: 'ring-green-300' },
  assinou:         { icon: PenLine,        color: 'text-green-700',   bg: 'bg-green-100',     ring: 'ring-green-400' },
  rejeitado:       { icon: XCircle,        color: 'text-red-600',     bg: 'bg-red-100',       ring: 'ring-red-300' },
};
const STATUS_DEFAULT_VIS = { icon: Clock, color: 'text-neutral-500', bg: 'bg-neutral-100', ring: 'ring-neutral-300' };

function RecruitmentCard({ status, daysInStatus, trainingDate, meetingDate, signingDate }: {
  status: RecruitmentStatus;
  daysInStatus: number | null;
  trainingDate?: string | null;
  meetingDate?: string | null;
  signingDate?: string | null;
}) {
  const vis = STATUS_VISUAL[status] ?? STATUS_DEFAULT_VIS;
  const Icon = vis.icon;
  const label = RECRUITMENT_LABEL_MAP[status as RecruitmentStatus] ?? status;
  const desc = statusDescription(status);
  const isRejected = status === 'rejeitado';

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

/* ───────────── Recruitment status descriptions & styles ───────────── */

function statusDescription(status: RecruitmentStatus | null): string {
  const map: Record<string, string> = {
    por_tratar: 'Jogador identificado, aguarda triagem inicial.',
    a_observar: 'Em abordagem — necessário observar ao vivo.',
    em_contacto: 'Observado e com interesse. Contacto em curso.',
    vir_treinar: 'Convidado a treinar connosco para avaliação.',
    reuniao_marcada: 'Reunião agendada com jogador ou representante.',
    a_decidir: 'Processo avançado, aguarda decisão do departamento.',
    confirmado: 'Jogador confirmado, a preparar assinatura.',
    assinou: 'Processo concluído — jogador assinou.',
    rejeitado: 'Jogador rejeitou a proposta ou não quer vir.',
  };
  return map[status ?? ''] ?? '';
}

function statusCardStyle(status: RecruitmentStatus | null): { border: string; bg: string } {
  const map: Record<string, { border: string; bg: string }> = {
    por_tratar: { border: 'border-l-neutral-400', bg: 'bg-neutral-50/60' },
    a_observar: { border: 'border-l-yellow-500', bg: 'bg-yellow-50/60' },
    em_contacto: { border: 'border-l-purple-500', bg: 'bg-purple-50/60' },
    vir_treinar: { border: 'border-l-blue-500', bg: 'bg-blue-50/60' },
    reuniao_marcada: { border: 'border-l-orange-500', bg: 'bg-orange-50/60' },
    a_decidir: { border: 'border-l-blue-800', bg: 'bg-blue-50/60' },
    confirmado: { border: 'border-l-green-500', bg: 'bg-green-50/60' },
    assinou: { border: 'border-l-green-700', bg: 'bg-green-50/60' },
    rejeitado: { border: 'border-l-red-500', bg: 'bg-red-50/60' },
  };
  return map[status ?? ''] ?? { border: 'border-l-neutral-300', bg: 'bg-neutral-50/60' };
}

/* ───────────── Rating color map (shared by header widgets + EvalRating) ───────────── */

const RATING_COLOR_MAP: Record<number, { dot: string; num: string; bg: string; border: string; ring: string }> = {
  1: { dot: 'bg-red-500', num: 'text-red-600', bg: 'bg-red-50/80', border: 'border-red-200', ring: 'border-red-400' },
  2: { dot: 'bg-orange-400', num: 'text-orange-600', bg: 'bg-orange-50/80', border: 'border-orange-200', ring: 'border-orange-400' },
  3: { dot: 'bg-blue-400', num: 'text-blue-600', bg: 'bg-blue-50/80', border: 'border-blue-200', ring: 'border-blue-400' },
  4: { dot: 'bg-emerald-400', num: 'text-emerald-600', bg: 'bg-emerald-50/80', border: 'border-emerald-200', ring: 'border-emerald-400' },
  5: { dot: 'bg-emerald-600', num: 'text-emerald-700', bg: 'bg-emerald-50/80', border: 'border-emerald-200', ring: 'border-emerald-500' },
};
const RATING_DEFAULT = { dot: 'bg-neutral-300', num: 'text-neutral-500', bg: 'bg-neutral-50', border: 'border-neutral-200', ring: 'border-neutral-300' };

function parseRating(value: string) {
  const numMatch = value.match(/^(\d)/);
  const rating = numMatch ? parseInt(numMatch[1], 10) : 0;
  const ratingText = value.replace(/^\d\s*-\s*/, '');
  const colors = RATING_COLOR_MAP[rating] ?? RATING_DEFAULT;
  return { rating, ratingText, colors };
}

/** Observer evaluation rating — 1-5 scale with colored dots and label */
function EvalRating({ label, value }: { label: string; value: string }) {
  if (!value) {
    return <InfoItem label={label} value="—" />;
  }

  // Extract numeric rating from values like "4 - Muito Bom"
  const numMatch = value.match(/^(\d)/);
  const rating = numMatch ? parseInt(numMatch[1], 10) : 0;
  const maxRating = 5;

  // Rating text (after the number)
  const ratingText = value.replace(/^\d\s*-\s*/, '');

  // Color per rating level
  const RATING_COLORS: Record<number, { dot: string; text: string; bg: string }> = {
    1: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
    2: { dot: 'bg-orange-400', text: 'text-orange-700', bg: 'bg-orange-50' },
    3: { dot: 'bg-blue-400', text: 'text-blue-700', bg: 'bg-blue-50' },
    4: { dot: 'bg-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50' },
    5: { dot: 'bg-emerald-600', text: 'text-emerald-800', bg: 'bg-emerald-50' },
  };

  const colors = RATING_COLORS[rating] ?? { dot: 'bg-neutral-300', text: 'text-neutral-600', bg: 'bg-neutral-50' };

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex items-center gap-2">
        {/* Dots */}
        <div className="flex gap-0.5">
          {Array.from({ length: maxRating }, (_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full ${i < rating ? colors.dot : 'bg-neutral-200'}`}
            />
          ))}
        </div>
        {/* Label */}
        <span className={`rounded px-1.5 py-px text-xs font-semibold ${colors.text} ${colors.bg}`}>
          {ratingText || value}
        </span>
      </div>
    </div>
  );
}

/** First name + last name (e.g. "Leonardo Diego Baptista Santos" → "Leonardo Santos") */
function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-PT');
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const date = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    // Only show time if it's not midnight (meaning time was actually set)
    return time === '00:00' ? date : `${date} ${time}`;
  } catch {
    return dateStr;
  }
}

/* MiniPitch and PitchCanvas imported from @/components/common/MiniPitch */
