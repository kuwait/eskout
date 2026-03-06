// src/components/players/PlayerProfile.tsx
// Full player profile — photo, all sections open, editable fields, notes, history
// All sections visible by default (no collapsible). Edit mode toggles inline editing.
// RELEVANT FILES: src/app/jogadores/[id]/page.tsx, src/components/players/ObservationNotes.tsx, src/components/players/StatusHistory.tsx

'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, ExternalLink, Camera, Pencil, Printer, Save, User, X } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { MiniPitch, PitchCanvas } from '@/components/common/MiniPitch';
import { RefreshPlayerButton } from '@/components/players/RefreshPlayerButton';
import { ObservationNotes, AddNoteButton } from '@/components/players/ObservationNotes';
import { StatusHistory } from '@/components/players/StatusHistory';
import {
  POSITION_LABELS,
  POSITIONS,
  DEPARTMENT_OPINIONS,
  FOOT_OPTIONS,
  FOOT_LABEL_MAP,
  RECRUITMENT_STATUSES,
  RECRUITMENT_LABEL_MAP,
} from '@/lib/constants';
import { updatePlayer } from '@/actions/players';
import { autoScrapePlayer } from '@/actions/scraping';
import type {
  Player,
  PositionCode,
  UserRole,
  ObservationNote,
  StatusHistoryEntry,
  DepartmentOpinion,
  Foot,
  RecruitmentStatus,
} from '@/lib/types';

interface PlayerProfileProps {
  player: Player;
  userRole: UserRole;
  notes?: ObservationNote[];
  statusHistory?: StatusHistoryEntry[];
  /** If provided, "Voltar" calls this instead of router.back() */
  onClose?: () => void;
  /** Age group name (e.g. "Sub-17") for display in squad badge */
  ageGroupName?: string | null;
}

export function PlayerProfile({ player, userRole, notes = [], statusHistory = [], onClose, ageGroupName }: PlayerProfileProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(player);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const isAdmin = userRole === 'admin';

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
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              <Save className="mr-1 h-3 w-3" />
              Guardar
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
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
            <h1 className="text-2xl font-bold">{p.name}</h1>
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
          {/* Mobile-only rating bar */}
          {!editing && p.observerEval && (() => {
            const { rating, ratingText, colors: c } = parseRating(p.observerEval);
            return (
              <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 sm:hidden ${c.bg} ${c.border}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${c.ring}`}>
                  <span className={`text-lg font-black ${c.num}`}>{rating}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-bold ${c.num}`}>{ratingText}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Avaliação</span>
                  </div>
                  <div className="flex h-1.5 gap-[3px]">
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className={`flex-1 rounded-full ${i < rating ? c.dot : 'bg-neutral-200/60'}`} />
                    ))}
                  </div>
                </div>
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
          <div className="hidden shrink-0 self-center sm:block">
            <MiniPitch
              primaryPosition={p.positionNormalized as PositionCode}
              secondaryPosition={p.secondaryPosition as PositionCode | null}
              tertiaryPosition={p.tertiaryPosition as PositionCode | null}
            />
          </div>
        )}
        {!editing && p.observerEval && (() => {
          const { rating, ratingText, colors: c } = parseRating(p.observerEval);
          return (
            <div className={`hidden shrink-0 self-center rounded-2xl border px-6 py-3 sm:flex ${c.bg} ${c.border}`}>
              <div className="flex items-center gap-4">
                {/* Circle with number */}
                <div className={`flex h-16 w-16 items-center justify-center rounded-full border-[3px] ${c.ring}`}>
                  <span className={`text-3xl font-black ${c.num}`}>{rating}</span>
                </div>
                {/* Right side: label + bar + text */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Avaliação</span>
                  <span className={`text-base font-extrabold leading-none ${c.num}`}>{ratingText}</span>
                  <div className="flex h-1.5 w-24 gap-[3px]">
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className={`flex-1 rounded-full ${i < rating ? c.dot : 'bg-neutral-200/60'}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <Separator />

      {/* ───────────── Two-column layout on desktop, single on mobile ───────────── */}
      {/* In edit mode: single column (forms need more space) */}
      {editing ? (
        <div className="space-y-3">
          {/* ───────────── Informação Básica (Edit) ───────────── */}
          <Section title="Informação Básica">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EditField label="Data Nascimento">
                <Input type="date" value={draft.dob ?? ''} onChange={(e) => updateDraft('dob', e.target.value)} />
              </EditField>
              <EditField label="Clube">
                <Input value={draft.club} onChange={(e) => updateDraft('club', e.target.value)} />
              </EditField>
              <EditField label="Posição Principal">
                <Select value={draft.positionNormalized || 'none'} onValueChange={(v) => updateDraft('positionNormalized', v === 'none' ? '' : v as PositionCode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos.code} value={pos.code}>{pos.code} — {pos.labelPt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditField>
              <EditField label="Posição Secundária">
                <Select value={draft.secondaryPosition || 'none'} onValueChange={(v) => updateDraft('secondaryPosition', v === 'none' ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos.code} value={pos.code}>{pos.code} — {pos.labelPt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditField>
              <EditField label="Posição Terciária">
                <Select value={draft.tertiaryPosition || 'none'} onValueChange={(v) => updateDraft('tertiaryPosition', v === 'none' ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos.code} value={pos.code}>{pos.code} — {pos.labelPt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditField>
              <EditField label="Pé">
                <Select value={draft.foot || 'none'} onValueChange={(v) => updateDraft('foot', (v === 'none' ? '' : v) as Foot)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {FOOT_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditField>
              <EditField label="Número">
                <Input value={draft.shirtNumber} onChange={(e) => updateDraft('shirtNumber', e.target.value)} />
              </EditField>
              <EditField label="Contacto">
                <Input type="tel" value={draft.contact} onChange={(e) => updateDraft('contact', e.target.value)} placeholder="+351 912 345 678" />
              </EditField>
              <EditField label="Referenciado por">
                <Input value={draft.referredBy} onChange={(e) => updateDraft('referredBy', e.target.value)} />
              </EditField>
              <EditField label="Observador">
                <Input value={draft.observer} onChange={(e) => updateDraft('observer', e.target.value)} />
              </EditField>
              <EditField label="Opinião Departamento">
                <div className="space-y-1.5">
                  {DEPARTMENT_OPINIONS.map((o) => {
                    const checked = draft.departmentOpinion.includes(o.value);
                    return (
                      <label key={o.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? draft.departmentOpinion.filter((v) => v !== o.value)
                              : [...draft.departmentOpinion, o.value];
                            updateDraft('departmentOpinion', next as DepartmentOpinion[]);
                          }}
                          className="h-4 w-4 rounded border-neutral-300"
                        />
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.tailwind}`}>
                          {o.value}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </EditField>
              <EditField label="Estado Recrutamento">
                <Select value={draft.recruitmentStatus ?? 'none'} onValueChange={(v) => updateDraft('recruitmentStatus', v === 'none' ? null : v as RecruitmentStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {RECRUITMENT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.labelPt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditField>
            </div>
          </Section>

          {/* ───────────── Links Externos (Edit) ───────────── */}
          <Section title="Links Externos">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <EditField label="URL da Foto">
                  <Input value={draft.photoUrl ?? ''} onChange={(e) => updateDraft('photoUrl', e.target.value || null)} placeholder="https://... (FPF, ZeroZero, etc.)" />
                </EditField>
              </div>
              <EditField label="Link FPF">
                <Input value={draft.fpfLink} onChange={(e) => updateDraft('fpfLink', e.target.value)} placeholder="https://..." />
              </EditField>
              <EditField label="Link ZeroZero">
                <Input value={draft.zerozeroLink} onChange={(e) => updateDraft('zerozeroLink', e.target.value)} placeholder="https://..." />
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
                <InfoItem label="Data Nascimento" value={p.dob ? formatDate(p.dob) : '—'} />
                <InfoItem label="Clube" value={p.club || '—'} highlight={!!p.club} />
                <InfoItem label="Número" value={p.shirtNumber || '—'} />
                <InfoItem label="Pé" value={p.foot ? FOOT_LABEL_MAP[p.foot] ?? p.foot : '—'} />
                <InfoItem label="Altura" value={p.height ? `${p.height} cm` : '—'} />
                <InfoItem label="Peso" value={p.weight ? `${p.weight} kg` : '—'} />
                <InfoItem label="Nacionalidade" value={p.nationality || '—'} />
                <InfoItem label="País Nascimento" value={p.birthCountry || '—'} />
              </InfoGrid>
            </Section>

            {/* Observação — scout info, evaluation, and reports */}
            <Section title="Observação">
              <InfoGrid>
                {/* Observers — each on its own line if multiple */}
                <div>
                  {(() => {
                    const names = [p.observer, p.referredBy].filter(Boolean).join(', ').split(',').map((n) => n.trim()).filter(Boolean);
                    const label = names.length > 1 ? 'Observadores' : 'Observador';
                    if (names.length === 0) return <><p className="text-xs font-medium text-muted-foreground">Observador</p><p className="text-sm">—</p></>;
                    return (
                      <><p className="text-xs font-medium text-muted-foreground">{label}</p>
                      <div className="mt-1 space-y-1.5">
                        {names.map((name, i) => (
                          <div key={i} className="rounded border-l-[3px] border-l-neutral-400 bg-neutral-50 py-1 pl-2.5 pr-2 text-sm font-medium">{name}</div>
                        ))}
                      </div></>
                    );
                  })()}
                </div>
                <InfoItem label="Decisão" value={p.observerDecision || '—'} />
                {p.observerEval && <EvalRating label="Avaliação" value={p.observerEval} />}
              </InfoGrid>

              {/* Relatórios */}
              {p.reportLabels.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Relatórios ({p.reportLabels.length})</p>
                  {p.reportLabels.map((rawLabel, i) => {
                    // Strip .pdf extension and parse label: "YYYY Nome - Clube" → extract club name
                    const label = rawLabel.replace(/\.pdf$/i, '');
                    const clubMatch = label.match(/\s-\s(.+)$/);
                    const clubName = clubMatch ? clubMatch[1] : null;
                    const link = p.reportLinks[i];

                    return (
                      <a
                        key={i}
                        href={link || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 rounded-md border-l-[3px] border-l-neutral-300 bg-neutral-50/60 px-3 py-2 transition-colors hover:border-l-blue-400 hover:bg-blue-50/40"
                      >
                        {/* Report number badge */}
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500 group-hover:bg-blue-100 group-hover:text-blue-600">
                          {i + 1}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          {clubName ? (
                            <p className="truncate text-sm font-medium">{clubName}</p>
                          ) : (
                            <p className="truncate text-sm font-medium">{label}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Relatório de observação {link ? '· PDF' : ''}
                          </p>
                        </div>

                        {/* External link icon */}
                        {link && (
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section title="Recrutamento">
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
            </Section>
          </div>

          {/* Right column: activity */}
          <div className="space-y-3">
            <Section
              title="Notas de Observação"
              action={<AddNoteButton onClick={() => setShowNoteForm(true)} />}
            >
              <ObservationNotes
                playerId={player.id}
                notes={notes}
                showForm={showNoteForm}
                onShowFormChange={setShowNoteForm}
              />
            </Section>

            <Section title="Histórico">
              <StatusHistory entries={statusHistory} />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Helper Components ───────────── */

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="px-4 pb-1.5 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">{children}</CardContent>
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
