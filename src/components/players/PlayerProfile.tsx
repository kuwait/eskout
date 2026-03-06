// src/components/players/PlayerProfile.tsx
// Full player profile — photo, all sections open, editable fields, notes, history
// All sections visible by default (no collapsible). Edit mode toggles inline editing.
// RELEVANT FILES: src/app/jogadores/[id]/page.tsx, src/components/players/ObservationNotes.tsx, src/components/players/StatusHistory.tsx

'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, ExternalLink, Camera, Pencil, Printer, Save, Trash2, User, X } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
} from '@/lib/constants';
import { updatePlayer, deletePlayer } from '@/actions/players';
import { autoScrapePlayer } from '@/actions/scraping';
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
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const profileRef = useRef<HTMLDivElement>(null);
  const isAdmin = userRole === 'admin';

  // Hybrid rating from player (pre-computed: report ratings + scout evaluations)
  const hybridAvgRating = player.reportAvgRating;
  const hybridRatingCount = player.reportRatingCount;

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
        department_opinion: draft.departmentOpinion.length > 0 ? draft.departmentOpinion : [],
        observer: draft.observer || null,
        observer_eval: draft.observerEval || null,
        observer_decision: draft.observerDecision || null,
        referred_by: draft.referredBy || null,
        photo_url: draft.photoUrl || null,
        fpf_link: draft.fpfLink || null,
        zerozero_link: draft.zerozeroLink || null,
        recruitment_status: draft.recruitmentStatus,
        recruitment_notes: draft.recruitmentNotes || null,
      };
      const result = await updatePlayer(player.id, updates);
      if (result.success) {
        setEditing(false);
        // Refresh server data so status history and updated fields show immediately
        router.refresh();
        // Auto-scrape if external links changed
        const fpfChanged = (draft.fpfLink || '') !== (player.fpfLink || '');
        const zzChanged = (draft.zerozeroLink || '') !== (player.zerozeroLink || '');
        if (fpfChanged || zzChanged) {
          autoScrapePlayer(player.id, fpfChanged, zzChanged);
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

  // Data source for rendering (draft while editing, player while viewing)
  const p = editing ? draft : player;

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
      {/* Back + Edit buttons (hidden during export/print capture) */}
      <div data-export-hide className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClose ?? (() => router.back())}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
        {!editing && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Exportar">
                  <Download className="h-4 w-4" />
                </Button>
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
            <RefreshPlayerButton player={player} />
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Pencil className="mr-1 h-3 w-3" />
                Editar
              </Button>
            )}
          </div>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending || isDeleting}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Eliminar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending || isDeleting}>
              <Save className="mr-1 h-3 w-3" />
              Guardar
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isDeleting}>
              <X className="mr-1 h-3 w-3" />
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {/* ───────────── Header with Photo ───────────── */}
      <div className="flex gap-4">
        {/* Photo: manual URL > ZeroZero > fallback icon */}
        <div className="shrink-0">
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
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {editing ? (
            <Input
              value={draft.name}
              onChange={(e) => updateDraft('name', e.target.value)}
              className="text-xl font-bold"
            />
          ) : (
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold">{p.name}</h1>
              <ObservationBadge player={p} showLabel />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
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
            <OpinionBadge opinion={p.departmentOpinion} />
          </div>
          {/* Mobile-only rating pill — compact */}
          {!editing && (hybridAvgRating !== null || p.observerEval) && (() => {
            const primaryValue = hybridAvgRating ?? (p.observerEval ? parseRating(p.observerEval).rating : 0);
            const primaryInt = Math.round(primaryValue);
            const c = RATING_COLOR_MAP[primaryInt] ?? RATING_DEFAULT;
            const isAvg = hybridAvgRating !== null;
            const displayValue = isAvg ? hybridAvgRating.toFixed(1) : String(primaryValue);
            return (
              <div className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 xl:hidden ${c.bg} ${c.border}`}>
                <span className={`text-xl font-black leading-none ${c.num}`}>{displayValue}</span>
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Aval.</span>
              </div>
            );
          })()}
          {/* External links */}
          {!editing && (p.fpfLink || p.zerozeroLink) && (
            <div className="flex flex-wrap gap-1.5">
              {p.fpfLink && (
                <a
                  href={p.fpfLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-neutral-50"
                >
                  <Image src="https://upload.wikimedia.org/wikipedia/pt/7/75/Portugal_FPF.png" alt="FPF" width={16} height={16} className="h-4 w-4 object-contain" unoptimized />
                  FPF
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                </a>
              )}
              {p.zerozeroLink && (
                <a
                  href={p.zerozeroLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-neutral-50"
                >
                  <Image src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Zerozero-logo.svg/1280px-Zerozero-logo.svg.png" alt="ZeroZero" width={16} height={16} className="h-4 w-4 object-contain" unoptimized />
                  ZeroZero
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                </a>
              )}
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
        {/* Desktop rating widget — tall card matching MiniPitch height */}
        {!editing && (hybridAvgRating !== null || p.observerEval) && (() => {
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
      </div>

      <Separator />

      {/* ───────────── Two-column layout on desktop, single on mobile ───────────── */}
      {/* In edit mode: single column (forms need more space) */}
      {editing ? (
        <div className="space-y-3">
          {/* ───────────── Info Básica + Posição — side by side ───────────── */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Section title="Informação Básica" stretch>
              <div className="grid h-full grid-cols-2 content-between gap-x-4">
                <EditField label="Data Nascimento">
                  <Input type="date" value={draft.dob ?? ''} onChange={(e) => updateDraft('dob', e.target.value)} />
                </EditField>
                <EditField label="Clube">
                  <Input value={draft.club} onChange={(e) => updateDraft('club', e.target.value)} />
                </EditField>
                <EditField label="Nacionalidade">
                  <Select value={draft.nationality || 'none'} onValueChange={(v) => updateDraft('nationality', v === 'none' ? null : v)}>
                    <SelectTrigger className="w-full">
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
                  <ShirtNumberPicker value={draft.shirtNumber} onChange={(v) => updateDraft('shirtNumber', v)} />
                </EditField>
                <EditField label="Pé">
                  <div className="flex gap-1">
                    {FOOT_OPTIONS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => updateDraft('foot', (draft.foot === f.value ? '' : f.value) as Foot)}
                        className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${draft.foot === f.value ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400'}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </EditField>
                <EditField label="Contacto">
                  <Input type="tel" value={draft.contact} onChange={(e) => updateDraft('contact', e.target.value)} placeholder="+351 912 345 678" />
                </EditField>
              </div>
            </Section>

            <Section title="Posição" stretch>
              <div className="flex h-full flex-col items-center justify-center gap-2">
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
          </div>

          {/* ───────────── Observação & Recrutamento (Edit) ───────────── */}
          <Section title="Observação & Recrutamento">
            <div className="space-y-3">
              <EditField label="Referência">
                <Input value={draft.referredBy} onChange={(e) => updateDraft('referredBy', e.target.value)} />
              </EditField>
              <EditField label="Decisão">
                <div className="flex flex-wrap gap-1">
                  {OBSERVER_DECISIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateDraft('observerDecision', (draft.observerDecision === d ? '' : d) as ObserverDecision)}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${draft.observerDecision === d ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </EditField>
              <EditField label="Opinião Departamento">
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENT_OPINIONS.map((o) => {
                    const checked = draft.departmentOpinion.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          const next = checked
                            ? draft.departmentOpinion.filter((v) => v !== o.value)
                            : [...draft.departmentOpinion, o.value];
                          updateDraft('departmentOpinion', next as DepartmentOpinion[]);
                        }}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${checked ? `${o.tailwind} border-current` : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300'}`}
                      >
                        {o.value}
                      </button>
                    );
                  })}
                </div>
              </EditField>
            </div>
          </Section>

          {/* ───────────── Links & Foto (Edit) ───────────── */}
          <Section title="Links & Foto">
            <div className="space-y-3">
              <EditField label="Link FPF">
                <Input value={draft.fpfLink} onChange={(e) => updateDraft('fpfLink', e.target.value)} placeholder="https://www.fpf.pt/..." className="font-mono text-xs" />
              </EditField>
              <EditField label="Link ZeroZero">
                <Input value={draft.zerozeroLink} onChange={(e) => updateDraft('zerozeroLink', e.target.value)} placeholder="https://www.zerozero.pt/..." className="font-mono text-xs" />
              </EditField>
              <EditField label="URL da Foto">
                <Input value={draft.photoUrl ?? ''} onChange={(e) => updateDraft('photoUrl', e.target.value || null)} placeholder="https://..." className="font-mono text-xs" />
              </EditField>
            </div>
          </Section>
        </div>
      ) : (
        /* ───────────── View mode: two columns on lg ───────────── */
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Left column: player data & docs */}
          <div className="space-y-3">
            <Section title="Informação Básica">
              <InfoGrid>
                {p.dob && <InfoItem label="Data Nascimento" value={formatDate(p.dob)} />}
                {p.club && (
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">Clube</p>
                    <ClubBadge
                      club={p.club}
                      logoUrl={p.clubLogoUrl}
                      size="md"
                      onRemoveLogo={p.clubLogoUrl ? () => {
                        startTransition(async () => {
                          const { updatePlayer } = await import('@/actions/players');
                          await updatePlayer(player.id, { club_logo_url: null });
                        });
                      } : undefined}
                    />
                  </div>
                )}
                {p.shirtNumber && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Número</p>
                    <JerseySvg number={p.shirtNumber} className="h-10 w-8 text-neutral-800" />
                  </div>
                )}
                {p.foot && <InfoItem label="Pé" value={FOOT_LABEL_MAP[p.foot] ?? p.foot} />}
                {p.height && <InfoItem label="Altura" value={`${p.height} cm`} />}
                {p.weight && <InfoItem label="Peso" value={`${p.weight} kg`} />}
                {p.nationality && <InfoItem label="Nacionalidade" value={`${getNationalityFlag(p.nationality)} ${p.nationality}`} />}
                {p.birthCountry && <InfoItem label="País Nascimento" value={p.birthCountry} />}
                {p.referredBy && <InfoItem label="Referência" value={p.referredBy} />}
              </InfoGrid>
            </Section>

            {/* Observação — scout info, decision, and reports (hidden if completely empty) */}
            {(() => {
              const observerNames = p.observer ? p.observer.split(',').map((n) => n.trim()).filter(Boolean) : [];
              const hasObservation = observerNames.length > 0 || p.observerDecision || scoutingReports.length > 0 || p.reportLabels.length > 0;
              if (!hasObservation) return null;
              return (
                <Section title="Observação">
                  {(observerNames.length > 0 || p.observerDecision) && (
                    <InfoGrid>
                      {observerNames.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">{observerNames.length > 1 ? 'Observadores' : 'Observador'}</p>
                          <div className="mt-1 space-y-1.5">
                            {observerNames.map((name, i) => (
                              <div key={i} className="rounded border-l-[3px] border-l-neutral-400 bg-neutral-50 py-1 pl-2.5 pr-2 text-sm font-medium">{name}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {p.observerDecision && <InfoItem label="Decisão" value={p.observerDecision} />}
                    </InfoGrid>
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

            <Section
              title="Notas de Observação"
              action={<AddNoteButton onClick={() => setShowNoteForm(true)} />}
            >
              <ObservationNotes
                playerId={player.id}
                notes={notes}
                showForm={showNoteForm}
                onShowFormChange={setShowNoteForm}
                isAdmin={isAdmin}
              />
            </Section>
          </div>

          {/* Right column: activity */}
          <div className="space-y-3">
            {/* Scout evaluations — interactive stars + team aggregate */}
            <ScoutEvaluations
              playerId={p.id}
              evaluations={scoutEvaluations}
              currentUserId={currentUserId}
              reportRatings={scoutingReports.filter((r) => r.rating !== null).map((r) => ({ rating: r.rating!, scoutName: r.scoutName }))}
            />

            {/* Recrutamento — hidden when completely empty */}
            {(p.recruitmentStatus || p.isRealSquad || p.isShadowSquad || p.trainingDate || p.meetingDate || p.signingDate || p.contact || p.recruitmentNotes) && <Section title="Recrutamento">
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
                      <div className={`rounded-lg border-l-[3px] px-3 py-2.5 ${statusCardStyle(p.recruitmentStatus).border} ${statusCardStyle(p.recruitmentStatus).bg}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={p.recruitmentStatus} />
                            {daysInStatus !== null && daysInStatus > 0 && (
                              <span className="text-[11px] text-muted-foreground">
                                há {daysInStatus} {daysInStatus === 1 ? 'dia' : 'dias'}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {statusDescription(p.recruitmentStatus)}
                        </p>
                      </div>
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
                          {p.positionNormalized && (
                            <p className="mt-0.5 pl-4 text-xs text-green-700">
                              Posição: <span className="font-bold">{p.positionNormalized} — {POSITION_LABELS[p.positionNormalized as PositionCode]}</span>
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
                              Posição: <span className="font-bold">{p.shadowPosition} — {POSITION_LABELS[p.shadowPosition as PositionCode] ?? p.shadowPosition}</span>
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

                    {/* Key dates */}
                    {(p.trainingDate || p.meetingDate || p.signingDate) && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                        {p.trainingDate && (
                          <div className="rounded-md border bg-blue-50 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Treino</p>
                            <p className="text-sm font-medium">{formatDateTime(p.trainingDate)}</p>
                          </div>
                        )}
                        {p.meetingDate && (
                          <div className="rounded-md border bg-orange-50 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-600">Reunião</p>
                            <p className="text-sm font-medium">{formatDateTime(p.meetingDate)}</p>
                          </div>
                        )}
                        {p.signingDate && (
                          <div className="rounded-md border bg-green-50 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Assinatura</p>
                            <p className="text-sm font-medium">{formatDateTime(p.signingDate)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Contact */}
                    {p.contact && (
                      <div className="flex items-center gap-2 rounded-md border bg-neutral-50/60 px-3 py-2">
                        <span className="text-xs font-medium text-muted-foreground">Contacto</span>
                        <span className="text-sm font-medium">{p.contact}</span>
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

            {statusHistory.length > 0 && (
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
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar jogador?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto irá eliminar permanentemente <strong>{player.name}</strong> e todos os dados associados
              (notas, histórico, relatórios). Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? 'A eliminar...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────── Helper Components ───────────── */

function Section({ title, action, children, stretch }: { title: string; action?: React.ReactNode; children: React.ReactNode; stretch?: boolean }) {
  return (
    <Card className={stretch ? 'flex h-full flex-col' : ''}>
      <CardHeader className="px-4 pb-1.5 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className={`px-4 pb-3 pt-0 ${stretch ? 'flex-1' : ''}`}>{children}</CardContent>
    </Card>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">{children}</div>
  );
}

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {highlight ? (
        <p className="text-sm font-bold tracking-tight">{value}</p>
      ) : (
        <p className="text-sm">{value}</p>
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

function ShirtNumberPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hoverNum, setHoverNum] = useState<string | null>(null);
  // Jersey shows: hovered number > selected number > '?'
  const previewNum = (hoverNum ?? value) || '?';
  const hasValue = !!(hoverNum ?? value);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setHoverNum(null); }}>
      <PopoverTrigger asChild>
        <button type="button" className="group flex items-center justify-center transition-transform hover:scale-105">
          <JerseySvg
            number={value || undefined}
            className={`h-14 w-12 transition-colors ${value ? 'text-neutral-800' : 'text-neutral-300 group-hover:text-neutral-400'}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex flex-col items-center gap-2">
          {/* Jersey preview — updates on hover */}
          <JerseySvg
            number={previewNum}
            className={`h-20 w-16 shrink-0 transition-colors ${hasValue ? 'text-neutral-800' : 'text-neutral-300'}`}
          />
          {/* Number grid — all 99 visible, no scroll */}
          <div className="rounded-lg border bg-white p-1.5">
            <div className="grid grid-cols-10 gap-0.5">
              {Array.from({ length: 99 }, (_, i) => {
                const num = String(i + 1);
                const selected = value === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => { onChange(selected ? '' : num); setOpen(false); }}
                    onMouseEnter={() => setHoverNum(num)}
                    onMouseLeave={() => setHoverNum(null)}
                    className={`flex h-7 w-7 items-center justify-center rounded text-[11px] font-bold transition-all ${
                      selected
                        ? 'bg-neutral-900 text-white shadow-md scale-110'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:scale-110'
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-[11px] font-medium text-neutral-400 hover:text-neutral-600"
            >
              Limpar
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────── Interactive Pitch Position Picker ───────────── */

/** Position coordinates on a horizontal pitch (percentage-based) */
const EDIT_PITCH_POSITIONS: Record<PositionCode, { x: number; y: number }> = {
  GR:  { x: 8,  y: 50 },
  DE:  { x: 24, y: 82 },
  DC:  { x: 22, y: 50 },
  DD:  { x: 24, y: 18 },
  MDC: { x: 42, y: 38 },
  MC:  { x: 42, y: 62 },
  MOC: { x: 58, y: 50 },
  EE:  { x: 72, y: 86 },
  ED:  { x: 72, y: 14 },
  PL:  { x: 85, y: 50 },
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
    rejeitado: 'Descartado — não se adequa ao perfil.',
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
