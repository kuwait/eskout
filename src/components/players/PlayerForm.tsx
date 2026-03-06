// src/components/players/PlayerForm.tsx
// Link-first form for adding a new player — paste FPF/ZeroZero URLs, auto-scrape, review & save
// Manual entry as fallback when no external links are available
// RELEVANT FILES: src/actions/players.ts, src/actions/scraping.ts, src/lib/validators.ts, src/lib/constants.ts

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Globe, PenLine, CheckCircle2, AlertCircle, Search, ArrowLeft } from 'lucide-react';
import { createPlayer } from '@/actions/players';
import { scrapeFromLinks, type ScrapedNewPlayerData } from '@/actions/scraping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { POSITIONS, FOOT_OPTIONS } from '@/lib/constants';

/* ───────────── Types ───────────── */

type Mode = 'links' | 'form';

interface FormFields {
  name: string;
  dob: string;
  positionNormalized: string;
  club: string;
  foot: string;
  shirtNumber: string;
  contact: string;
  fpfLink: string;
  zerozeroLink: string;
  notes: string;
  photoUrl: string;
  height: string;
  weight: string;
  nationality: string;
  birthCountry: string;
}

const EMPTY_FIELDS: FormFields = {
  name: '', dob: '', positionNormalized: '', club: '', foot: '',
  shirtNumber: '', contact: '', fpfLink: '', zerozeroLink: '', notes: '',
  photoUrl: '', height: '', weight: '', nationality: '', birthCountry: '',
};

/* ───────────── FPF / ZeroZero brand logos (inline SVG-like pill) ───────────── */

const FPF_ICON = '🇵🇹';
const ZZ_ICON = '⚽';

/* ───────────── Component ───────────── */

export function PlayerForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('links');
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [scrapeResult, setScrapeResult] = useState<ScrapedNewPlayerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScraping, startScrape] = useTransition();
  const [isSaving, startSave] = useTransition();

  const loading = isScraping || isSaving;

  function updateField(key: keyof FormFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  /* ───────────── Scrape Handler ───────────── */

  function handleScrape() {
    const fpf = fields.fpfLink.trim();
    const zz = fields.zerozeroLink.trim();
    if (!fpf && !zz) {
      setError('Introduza pelo menos um link (FPF ou ZeroZero)');
      return;
    }

    setError(null);
    startScrape(async () => {
      const result = await scrapeFromLinks(fpf || undefined, zz || undefined);
      setScrapeResult(result);

      if (!result.success) {
        setError(result.errors.join('. ') || 'Erro ao buscar dados');
        return;
      }

      setFields((prev) => ({
        ...prev,
        name: result.name || prev.name,
        dob: result.dob || prev.dob,
        club: result.club || prev.club,
        positionNormalized: result.position || prev.positionNormalized,
        foot: result.foot || prev.foot,
        photoUrl: result.photoUrl || prev.photoUrl,
        height: result.height ? String(result.height) : prev.height,
        weight: result.weight ? String(result.weight) : prev.weight,
        nationality: result.nationality || prev.nationality,
        birthCountry: result.birthCountry || prev.birthCountry,
      }));

      if (result.errors.length > 0) {
        setError(result.errors.join('. '));
      }

      setMode('form');
    });
  }

  /* ───────────── Save Handler ───────────── */

  function handleSave() {
    setError(null);
    if (!fields.name.trim()) { setError('Nome é obrigatório'); return; }
    if (!fields.dob) { setError('Data de nascimento é obrigatória'); return; }
    if (!fields.club.trim()) { setError('Clube é obrigatório'); return; }

    startSave(async () => {
      const formData = new FormData();
      formData.set('name', fields.name.trim());
      formData.set('dob', fields.dob);
      formData.set('positionNormalized', fields.positionNormalized);
      formData.set('club', fields.club.trim());
      formData.set('foot', fields.foot);
      formData.set('shirtNumber', fields.shirtNumber);
      formData.set('contact', fields.contact);
      formData.set('fpfLink', fields.fpfLink.trim());
      formData.set('zerozeroLink', fields.zerozeroLink.trim());
      formData.set('notes', fields.notes);
      formData.set('departmentOpinion', 'Por Observar');
      formData.set('photoUrl', fields.photoUrl);
      formData.set('height', fields.height);
      formData.set('weight', fields.weight);
      formData.set('nationality', fields.nationality);
      formData.set('birthCountry', fields.birthCountry);

      const result = await createPlayer(formData);

      if (result.success && result.data) {
        router.push(`/jogadores/${result.data.id}`);
      } else {
        setError(result.error ?? 'Erro desconhecido');
      }
    });
  }

  /* ───────────── Render: Link Input Step ───────────── */

  if (mode === 'links') {
    return (
      <div className="mx-auto max-w-md space-y-6">
        {/* Hero section */}
        <div className="rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-800 p-6 text-white">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <Globe className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Importar por link</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Cole o link do jogador na FPF e/ou ZeroZero e os dados serão preenchidos automaticamente.
          </p>
        </div>

        {/* Link inputs */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fpfLink" className="text-xs font-medium text-neutral-500">
              {FPF_ICON} LINK FPF
            </Label>
            <Input
              id="fpfLink"
              value={fields.fpfLink}
              onChange={(e) => updateField('fpfLink', e.target.value)}
              placeholder="Colar link da FPF..."
              type="url"
              autoFocus
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="zerozeroLink" className="text-xs font-medium text-neutral-500">
              {ZZ_ICON} LINK ZEROZERO
            </Label>
            <Input
              id="zerozeroLink"
              value={fields.zerozeroLink}
              onChange={(e) => updateField('zerozeroLink', e.target.value)}
              placeholder="Colar link do ZeroZero..."
              type="url"
              className="h-11"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* CTA */}
        <Button
          size="lg"
          className="h-12 w-full text-sm font-semibold"
          disabled={loading || (!fields.fpfLink.trim() && !fields.zerozeroLink.trim())}
          onClick={handleScrape}
        >
          {isScraping ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              A buscar dados...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Buscar dados do jogador
            </>
          )}
        </Button>

        {/* Divider */}
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              ou
            </span>
          </div>
        </div>

        {/* Manual fallback */}
        <button
          type="button"
          disabled={loading}
          onClick={() => { setMode('form'); setError(null); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 py-3.5 text-sm font-medium text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700"
        >
          <PenLine className="h-4 w-4" />
          Inserir manualmente
        </button>
      </div>
    );
  }

  /* ───────────── Render: Form (pre-filled or manual) ───────────── */

  const wasScraped = scrapeResult?.success;

  return (
    <div className="mx-auto max-w-md space-y-5">
      {/* Back button */}
      <button
        type="button"
        onClick={() => {
          if (wasScraped) {
            setMode('links');
            setScrapeResult(null);
            setError(null);
          } else {
            router.back();
          }
        }}
        disabled={loading}
        className="flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {wasScraped ? 'Alterar links' : 'Voltar'}
      </button>

      {/* Scrape success banner + player card preview */}
      {wasScraped && (
        <div className="overflow-hidden rounded-2xl border border-green-100 bg-gradient-to-br from-green-50 to-white">
          <div className="flex items-center gap-3 p-4">
            {fields.photoUrl ? (
              <img
                src={fields.photoUrl}
                alt={fields.name || 'Foto'}
                className="h-16 w-16 rounded-xl border-2 border-white object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-green-100 text-xl font-bold text-green-600">
                {(fields.name || '?')[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                <p className="text-xs font-medium text-green-600">Dados obtidos</p>
              </div>
              <p className="mt-0.5 truncate text-base font-semibold text-neutral-900">
                {fields.name || 'Nome não encontrado'}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                {fields.club && <span>{fields.club}</span>}
                {fields.club && fields.positionNormalized && <span>·</span>}
                {fields.positionNormalized && <span>{fields.positionNormalized}</span>}
              </div>
            </div>
          </div>

          {/* Scraped metadata pills */}
          {(fields.nationality || fields.height || fields.weight || fields.birthCountry || fields.foot) && (
            <div className="flex flex-wrap gap-1.5 border-t border-green-100 bg-white/60 px-4 py-2.5">
              {fields.nationality && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                  {fields.nationality}
                </span>
              )}
              {fields.birthCountry && fields.birthCountry !== fields.nationality && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                  {fields.birthCountry}
                </span>
              )}
              {fields.foot && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                  Pé {fields.foot === 'Dir' ? 'Direito' : fields.foot === 'Esq' ? 'Esquerdo' : 'Ambidestro'}
                </span>
              )}
              {fields.height && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                  {fields.height} cm
                </span>
              )}
              {fields.weight && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                  {fields.weight} kg
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section label */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {wasScraped ? 'Confirmar dados' : 'Dados do jogador'}
      </p>

      {/* ───────────── Form fields ───────────── */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs">Nome *</Label>
          <Input
            id="name"
            value={fields.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Nome completo"
            className="h-11"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dob" className="text-xs">Data Nascimento *</Label>
            <Input
              id="dob"
              value={fields.dob}
              onChange={(e) => updateField('dob', e.target.value)}
              type="date"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="club" className="text-xs">Clube *</Label>
            <Input
              id="club"
              value={fields.club}
              onChange={(e) => updateField('club', e.target.value)}
              placeholder="Nome do clube"
              className="h-11"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="positionNormalized" className="text-xs">Posição</Label>
            <Select
              value={fields.positionNormalized || '_none'}
              onValueChange={(v) => updateField('positionNormalized', v === '_none' ? '' : v)}
            >
              <SelectTrigger id="positionNormalized" className="h-11">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                {POSITIONS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.code} — {p.labelPt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="foot" className="text-xs">Pé</Label>
            <Select
              value={fields.foot || '_none'}
              onValueChange={(v) => updateField('foot', v === '_none' ? '' : v)}
            >
              <SelectTrigger id="foot" className="h-11">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                {FOOT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Optional fields — collapsible on mobile, visible on desktop */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="shirtNumber" className="text-xs">Número</Label>
            <Input
              id="shirtNumber"
              value={fields.shirtNumber}
              onChange={(e) => updateField('shirtNumber', e.target.value)}
              placeholder="Ex: 10"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact" className="text-xs">Contacto</Label>
            <Input
              id="contact"
              value={fields.contact}
              onChange={(e) => updateField('contact', e.target.value)}
              type="tel"
              placeholder="+351..."
              className="h-11"
            />
          </div>
        </div>

        {/* Links — only visible in manual mode (scraped mode already has them) */}
        {!wasScraped && (
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fpfLink" className="text-xs">{FPF_ICON} Link FPF</Label>
              <Input
                id="fpfLink"
                value={fields.fpfLink}
                onChange={(e) => updateField('fpfLink', e.target.value)}
                type="url"
                placeholder="https://www.fpf.pt/..."
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="zerozeroLink" className="text-xs">{ZZ_ICON} Link ZeroZero</Label>
              <Input
                id="zerozeroLink"
                value={fields.zerozeroLink}
                onChange={(e) => updateField('zerozeroLink', e.target.value)}
                type="url"
                placeholder="https://www.zerozero.pt/..."
                className="h-11"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="notes" className="text-xs">Observações</Label>
          <Textarea
            id="notes"
            value={fields.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={2}
            placeholder="Notas sobre o jogador..."
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Save button */}
      <Button
        size="lg"
        className="h-12 w-full text-sm font-semibold"
        disabled={loading}
        onClick={handleSave}
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            A guardar...
          </>
        ) : (
          'Guardar jogador'
        )}
      </Button>
    </div>
  );
}
