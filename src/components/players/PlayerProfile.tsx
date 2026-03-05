// src/components/players/PlayerProfile.tsx
// Full player profile — photo, all sections open, editable fields, notes, history
// All sections visible by default (no collapsible). Edit mode toggles inline editing.
// RELEVANT FILES: src/app/jogadores/[id]/page.tsx, src/components/players/ObservationNotes.tsx, src/components/players/StatusHistory.tsx

'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Pencil, Save, User, X } from 'lucide-react';
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
import { RefreshPlayerButton } from '@/components/players/RefreshPlayerButton';
import { ObservationNotes } from '@/components/players/ObservationNotes';
import { StatusHistory } from '@/components/players/StatusHistory';
import {
  POSITION_LABELS,
  POSITIONS,
  DEPARTMENT_OPINIONS,
  FOOT_OPTIONS,
  RECRUITMENT_STATUSES,
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
        foot: draft.foot || null,
        shirt_number: draft.shirtNumber || null,
        contact: draft.contact || null,
        department_opinion: draft.departmentOpinion.length > 0 ? draft.departmentOpinion : [],
        observer: draft.observer || null,
        observer_eval: draft.observerEval || null,
        observer_decision: draft.observerDecision || null,
        referred_by: draft.referredBy || null,
        notes: draft.notes || null,
        photo_url: draft.photoUrl || null,
        fpf_link: draft.fpfLink || null,
        zerozero_link: draft.zerozeroLink || null,
        recruitment_status: draft.recruitmentStatus,
        recruitment_notes: draft.recruitmentNotes || null,
      };
      const result = await updatePlayer(player.id, updates);
      if (result.success) {
        setEditing(false);
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Back + Edit buttons */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClose ?? (() => router.back())}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
        {!editing && (
          <div className="flex items-center gap-2">
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
        <div className="min-w-0 space-y-2">
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
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium">
                {p.positionNormalized} — {POSITION_LABELS[p.positionNormalized as PositionCode]}
              </span>
            )}
            {p.foot && <span className="text-muted-foreground">Pé: {p.foot}</span>}
            <OpinionBadge opinion={p.departmentOpinion} />
            <StatusBadge status={p.recruitmentStatus} />
          </div>
        </div>
      </div>

      <Separator />

      {/* ───────────── Informação Básica ───────────── */}
      <Section title="Informação Básica">
        {editing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <EditField label="Data Nascimento">
              <Input type="date" value={draft.dob ?? ''} onChange={(e) => updateDraft('dob', e.target.value)} />
            </EditField>
            <EditField label="Clube">
              <Input value={draft.club} onChange={(e) => updateDraft('club', e.target.value)} />
            </EditField>
            <EditField label="Posição">
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
            <div className="sm:col-span-2">
              <EditField label="Observações">
                <Textarea value={draft.notes} onChange={(e) => updateDraft('notes', e.target.value)} rows={3} />
              </EditField>
            </div>
          </div>
        ) : (
          <>
            <InfoGrid>
              <InfoItem label="Data Nascimento" value={p.dob ? formatDate(p.dob) : '—'} />
              <InfoItem label="Clube" value={p.club || '—'} />
              <InfoItem label="Número" value={p.shirtNumber || '—'} />
              <InfoItem label="Contacto" value={p.contact || '—'} />
              <InfoItem label="Referenciado por" value={p.referredBy || '—'} />
              <InfoItem label="Observador" value={p.observer || '—'} />
              <InfoItem label="Altura" value={p.height ? `${p.height} cm` : '—'} />
              <InfoItem label="Peso" value={p.weight ? `${p.weight} kg` : '—'} />
              <InfoItem label="Nacionalidade" value={p.nationality || '—'} />
              <InfoItem label="País Nascimento" value={p.birthCountry || '—'} />
              <InfoItem label="Avaliação Obs." value={p.observerEval || '—'} />
              <InfoItem label="Decisão Obs." value={p.observerDecision || '—'} />
            </InfoGrid>
            {p.notes && (
              <div className="mt-3">
                <p className="text-sm font-medium text-muted-foreground">Observações</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{p.notes}</p>
              </div>
            )}
          </>
        )}
      </Section>

      {/* ───────────── Links Externos ───────────── */}
      {editing ? (
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
      ) : (p.fpfLink || p.zerozeroLink) && (
        <div className="flex flex-wrap gap-2">
          {p.fpfLink && (
            <a
              href={p.fpfLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-50"
            >
              <Image src="https://upload.wikimedia.org/wikipedia/pt/7/75/Portugal_FPF.png" alt="FPF" width={20} height={20} className="h-5 w-5 object-contain" unoptimized />
              FPF
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          )}
          {p.zerozeroLink && (
            <a
              href={p.zerozeroLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-50"
            >
              <Image src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Zerozero-logo.svg/1280px-Zerozero-logo.svg.png" alt="ZeroZero" width={20} height={20} className="h-5 w-5 object-contain" unoptimized />
              ZeroZero
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          )}
        </div>
      )}

      {/* ───────────── Relatórios de Observação ───────────── */}
      {p.reportLabels.length > 0 && (
        <Section title="Relatórios de Observação">
          <div className="space-y-2">
            {p.reportLabels.map((label, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">{label}</span>
                {p.reportLinks[i] && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={p.reportLinks[i]} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ───────────── Recrutamento ───────────── */}
      <Section title="Recrutamento">
        <div className="space-y-3">
          {/* Status + squad badges row */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.recruitmentStatus} />
            {p.isRealSquad && (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Atleta do Plantel{ageGroupName ? ` ${ageGroupName}` : ''}
              </span>
            )}
            {p.isShadowSquad && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Sombra — {p.shadowPosition ?? '?'}
              </span>
            )}
          </div>

          {/* Key dates */}
          {(p.trainingDate || p.meetingDate || p.signingDate) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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

          {/* Notes */}
          {p.recruitmentNotes && (
            <div className="rounded-md border bg-neutral-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Notas de Recrutamento</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{p.recruitmentNotes}</p>
            </div>
          )}
        </div>
      </Section>

      {/* ───────────── Notas de Observação ───────────── */}
      <Section title="Notas de Observação">
        <ObservationNotes playerId={player.id} notes={notes} />
      </Section>

      {/* ───────────── Histórico ───────────── */}
      <Section title="Histórico">
        <StatusHistory entries={statusHistory} />
      </Section>
    </div>
  );
}

/* ───────────── Helper Components ───────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
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

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
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
