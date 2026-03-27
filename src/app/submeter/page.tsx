// src/app/submeter/page.tsx
// Scout report submission form — mobile-first, used at the field during matches
// FPF link auto-fetches player data, scout fills in observation and evaluation
// RELEVANT FILES: src/actions/scout-reports.ts, src/actions/scraping.ts, src/app/avaliacoes/page.tsx

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, Search, Send, Star, User } from 'lucide-react';
import Image from 'next/image';
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
import { submitScoutReport, type ScoutReportInput } from '@/actions/scout-reports';
import { scrapeForScoutReport } from '@/actions/scraping';
import { fetchZzProfileClient } from '@/lib/zerozero/client';
import { cn } from '@/lib/utils';

/* ───────────── Constants ───────────── */

const POSITIONS = [
  { value: 'GR', label: 'Guarda-Redes' },
  { value: 'DD', label: 'Defesa Direito' },
  { value: 'DE', label: 'Defesa Esquerdo' },
  { value: 'DC', label: 'Defesa Central' },
  { value: 'MDC', label: 'Médio Defensivo' },
  { value: 'MC', label: 'Médio Centro' },
  { value: 'MOC', label: 'Médio Ofensivo' },
  { value: 'ED', label: 'Extremo Direito' },
  { value: 'EE', label: 'Extremo Esquerdo' },
  { value: 'PL', label: 'Ponta de Lança' },
];

const DECISIONS = [
  '1ª Escolha',
  '2ª Escolha',
  'Acompanhar',
  'Urgente Observar',
  'Potencial',
  'Sem interesse',
];

const RATING_LABELS: Record<number, string> = {
  1: 'Fraco',
  2: 'Dúvida',
  3: 'Bom',
  4: 'Muito Bom',
  5: 'Excelente',
};

const RATING_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  2: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
  3: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  4: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  5: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

/* ───────────── Helpers ───────────── */

// Extract player ID from FPF link: .../playerId/1234567 → "1234567"
function extractFpfId(url: string): string {
  const m = url.match(/playerId\/(\d+)/);
  return m ? m[1] : '';
}

// Extract player ID from ZeroZero link: /jogador/slug/12345 → "12345"
function extractZzId(url: string): string {
  const m = url.match(/\/jogador\/[^/]+\/(\d+)/);
  return m ? m[1] : '';
}

// Format phone: "912345678" → "912 345 678", "+351912345678" → "+351 912 345 678"
function formatPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  // Portuguese with country code
  if (digits.startsWith('+351') && digits.length > 4) {
    const local = digits.slice(4);
    return `+351 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`.trim();
  }
  // 9 digit local
  if (digits.length >= 3) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`.trim();
  }
  return digits;
}

/* ───────────── Component ───────────── */

export default function SubmeterPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Whether player data was auto-fetched (locks those fields)
  const [dataFetched, setDataFetched] = useState(false);
  // ZZ data found — pending acceptance by scout
  const [zzPending, setZzPending] = useState(false);
  const [zzAccepted, setZzAccepted] = useState(false);
  // Store ZZ-sourced values separately so we can reject them
  const [zzData, setZzData] = useState<{
    position?: string; foot?: string; shirtNumber?: string; nationality?: string;
    candidateName?: string; candidateAge?: number | null; candidateClub?: string;
    photoUrl?: string; link?: string;
  }>({});
  // Rating hover preview
  const [hoverRating, setHoverRating] = useState(0);
  // Track whether user attempted to submit (to show inline validation)
  const [attempted, setAttempted] = useState(false);

  // Form state
  const [form, setForm] = useState<ScoutReportInput>({
    playerName: '',
    playerClub: '',
    fpfLink: '',
    zerozeroLink: '',
    competition: '',
    match: '',
    matchDate: '',
    matchResult: '',
    shirtNumber: '',
    birthYear: '',
    foot: '',
    position: '',
    physicalProfile: '',
    strengths: '',
    weaknesses: '',
    rating: undefined,
    decision: '',
    analysis: '',
    contactInfo: '',
    nationality: '',
    birthCountry: '',
    height: undefined,
    weight: undefined,
    photoUrl: '',
    dob: '',
    secondaryPosition: '',
    tertiaryPosition: '',
    fpfPlayerId: '',
    zerozeroPlayerId: '',
  });

  function update(field: keyof ScoutReportInput, value: string | number | undefined) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function showFeedback(type: 'success' | 'error' | 'info', message: string, duration = 4000) {
    setFeedback({ type, message });
    if (duration > 0) setTimeout(() => setFeedback(null), duration);
  }

  // Inline validation check
  function isFieldInvalid(field: 'position' | 'rating' | 'decision'): boolean {
    if (!attempted) return false;
    if (field === 'position') return !form.position;
    if (field === 'rating') return !form.rating;
    if (field === 'decision') return !form.decision;
    return false;
  }

  /* ───────────── Fetch player data from FPF link ───────────── */

  async function handleFetchData() {
    const link = form.fpfLink.trim();
    if (!link) {
      showFeedback('error', 'Cola o link FPF primeiro');
      return;
    }
    // Validate it's a player link, not a club or other FPF page
    if (!link.includes('playerId') && !link.includes('Ficha-de-Jogador')) {
      showFeedback('error', 'Este link não é de um jogador FPF. Usa o link da ficha do jogador (ex: .../Ficha-de-Jogador/playerId/...)');
      return;
    }

    setIsFetching(true);
    showFeedback('info', 'A buscar dados do jogador...', 0);

    try {
      // Fetch ZZ data client-side via Edge proxy to avoid server IP blocking
      const zzLink = form.zerozeroLink?.trim() || undefined;
      let preZz: { profileData: import('@/lib/zerozero/parser').ZzParsedProfile | null; searchCandidate: { url: string; name: string; age: number | null; club: string | null } | null } | undefined;

      if (zzLink) {
        // Explicit ZZ link provided — fetch client-side
        try {
          const profileData = await fetchZzProfileClient(zzLink);
          preZz = { profileData, searchCandidate: null };
        } catch {
          preZz = { profileData: null, searchCandidate: null };
        }
      }
      // Note: auto-search without explicit ZZ link happens server-side (needs FPF data first for name/DOB)
      // But scrapeForScoutReport will use preZz when provided

      const result = await scrapeForScoutReport(link, zzLink, preZz);

      if (!result.success || !result.name) {
        showFeedback('error', result.errors?.join(', ') || 'Não foi possível obter dados do jogador');
        setIsFetching(false);
        return;
      }

      // Auto-fill FPF fields only — ZZ fields go to separate pending state
      const birthYear = result.dob ? new Date(result.dob).getFullYear().toString() : '';
      const hasZz = !!result.zzLinkFound;
      const zzFields = {
        position: result.position || '',
        foot: result.foot || '',
        shirtNumber: result.shirtNumber?.toString() || '',
      };

      setForm((prev) => ({
        ...prev,
        playerName: result.name || prev.playerName,
        playerClub: result.club || prev.playerClub,
        birthYear: birthYear || prev.birthYear,
        zerozeroLink: result.zzLinkFound || prev.zerozeroLink,
        // Auto-save all scraped data silently
        nationality: result.nationality || prev.nationality,
        birthCountry: result.birthCountry || prev.birthCountry,
        height: result.height ?? prev.height,
        weight: result.weight ?? prev.weight,
        photoUrl: result.photoUrl || prev.photoUrl,
        dob: result.dob || prev.dob,
        secondaryPosition: result.secondaryPosition || prev.secondaryPosition,
        tertiaryPosition: result.tertiaryPosition || prev.tertiaryPosition,
        fpfPlayerId: extractFpfId(link) || prev.fpfPlayerId,
        zerozeroPlayerId: result.zzLinkFound ? extractZzId(result.zzLinkFound) : prev.zerozeroPlayerId,
        // Only apply ZZ fields if no ZZ was found (they came from FPF fallback)
        ...(!hasZz ? { foot: zzFields.foot, position: zzFields.position, shirtNumber: zzFields.shirtNumber } : {}),
      }));

      if (hasZz) {
        setZzData({
          ...zzFields,
          nationality: result.nationality || undefined,
          candidateName: result.zzCandidateName || undefined,
          candidateAge: result.zzCandidateAge,
          candidateClub: result.zzCandidateClub || undefined,
          photoUrl: result.zzPhotoUrl || undefined,
          link: result.zzLinkFound || undefined,
        });
        setZzPending(true);
        setZzAccepted(false);
      }

      setDataFetched(true);
      setAttempted(false);
      const zzMsg = hasZz ? ' — ZeroZero encontrado, confirma abaixo' : '';
      showFeedback('success', `Dados carregados: ${result.name}${zzMsg}`);
    } catch {
      showFeedback('error', 'Erro ao aceder ao FPF');
    }

    setIsFetching(false);
  }

  /* ───────────── Submit ───────────── */

  function handleSubmit() {
    setAttempted(true);

    if (!dataFetched) {
      showFeedback('error', 'Primeiro busca os dados do jogador com o link FPF');
      return;
    }

    const missing: string[] = [];
    if (!form.playerName.trim()) missing.push('Nome');
    if (!form.playerClub.trim()) missing.push('Clube');
    if (!form.fpfLink.trim()) missing.push('Link FPF');
    if (!form.position) missing.push('Posição');
    if (!form.rating) missing.push('Avaliação');
    if (!form.decision) missing.push('Decisão');
    if (missing.length > 0) {
      showFeedback('error', `Campos obrigatórios em falta: ${missing.join(', ')}`);
      return;
    }

    startTransition(async () => {
      const result = await submitScoutReport(form);
      if (result.success) {
        showFeedback('success', 'Relatório submetido com sucesso!');
        setTimeout(() => router.push('/avaliacoes'), 1500);
      } else {
        showFeedback('error', result.error ?? 'Erro ao submeter');
      }
    });
  }

  /* ───────────── Reset ───────────── */

  function handleReset() {
    setForm({
      playerName: '', playerClub: '', fpfLink: '', zerozeroLink: '',
      competition: '', match: '', matchDate: '', matchResult: '',
      shirtNumber: '', birthYear: '', foot: '', position: '',
      physicalProfile: '', strengths: '', weaknesses: '',
      rating: undefined, decision: '', analysis: '', contactInfo: '',
      nationality: '', birthCountry: '', height: undefined, weight: undefined,
      photoUrl: '', dob: '', secondaryPosition: '', tertiaryPosition: '',
      fpfPlayerId: '', zerozeroPlayerId: '',
    });
    setDataFetched(false);
    setZzPending(false);
    setZzAccepted(false);
    setZzData({});
    setAttempted(false);
    setFeedback(null);
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold lg:text-2xl">Submeter Relatório</h1>
        {dataFetched && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`mb-4 rounded-md border px-4 py-2 text-sm ${
          feedback.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : feedback.type === 'info'
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="space-y-6">
        {/* ───────────── Links + Auto-fetch ───────────── */}
        <Section title="Identificação do Jogador">
          <Field label="Link FPF *">
            <div className="flex gap-2">
              <Input
                placeholder="https://portal.fpf.pt/..."
                value={form.fpfLink}
                onChange={(e) => update('fpfLink', e.target.value)}
                type="url"
                className="flex-1"
                disabled={isFetching || dataFetched}
              />
              <Button
                size="sm"
                onClick={handleFetchData}
                disabled={isFetching || !form.fpfLink.trim() || dataFetched}
                className="shrink-0"
              >
                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </Field>
          {/* Auto-filled FPF data */}
          {dataFetched && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-700">Dados FPF</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Nome</span>
                  <p className="font-medium">{form.playerName || '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Clube</span>
                  <p className="font-medium">{form.playerClub || '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Ano nascimento</span>
                  <p className="font-medium">{form.birthYear || '—'}</p>
                </div>
                {/* Show foot here only if it came from FPF (no ZZ found) */}
                {!zzPending && !zzAccepted && form.foot && (
                  <div>
                    <span className="text-xs text-muted-foreground">Pé</span>
                    <p className="font-medium">{form.foot}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ZZ data — pending confirmation (matches RefreshPlayerButton style) */}
          {dataFetched && zzPending && !zzAccepted && (
            <div className={cn(
              'rounded-md border p-3 space-y-3',
              'border-amber-200 bg-amber-50/50',
            )}>
              <p className="text-xs font-medium text-amber-800">
                É este o perfil ZeroZero? <span className="font-normal text-amber-600">(pode não corresponder)</span>
              </p>
              <div className="flex gap-3">
                {zzData.photoUrl ? (
                  <Image src={zzData.photoUrl} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-lg object-cover" unoptimized />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                    <User className="h-5 w-5 text-neutral-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{zzData.candidateName || '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {zzData.candidateAge ? `${zzData.candidateAge} anos` : ''}{zzData.candidateClub ? ` · ${zzData.candidateClub}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[zzData.position, zzData.foot, zzData.shirtNumber ? `Nº ${zzData.shirtNumber}` : '', zzData.nationality].filter(Boolean).join(' · ')}
                  </p>
                  {zzData.link && (
                    <a
                      href={zzData.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-block text-xs font-medium text-blue-600 hover:underline"
                    >
                      Verificar perfil ↗
                    </a>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      position: zzData.position || prev.position,
                      foot: zzData.foot || prev.foot,
                      shirtNumber: zzData.shirtNumber || prev.shirtNumber,
                    }));
                    setZzAccepted(true);
                  }}
                >
                  Sim, é este
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-100"
                  onClick={() => {
                    setZzPending(false);
                    setForm((prev) => ({ ...prev, zerozeroLink: '' }));
                  }}
                >
                  Não é este
                </Button>
              </div>
            </div>
          )}

          {/* ZZ accepted — show confirmed data */}
          {dataFetched && zzAccepted && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <div className="flex gap-3">
                {zzData.photoUrl ? (
                  <Image src={zzData.photoUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" unoptimized />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                    <User className="h-4 w-4 text-neutral-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-700">ZeroZero confirmado</p>
                  <p className="text-xs text-muted-foreground">
                    {[form.position, form.foot, form.shirtNumber ? `Nº ${form.shirtNumber}` : '', zzData.nationality].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Only show rest of form after data is fetched */}
        {dataFetched && (
          <>
            {/* ───────────── Posição (só se não veio do scrape e ZZ já foi decidido) ───────────── */}
            {!form.position && !(zzPending && !zzAccepted) && (
              <Section title="Posição">
                <Field label="Posição observada *" error={isFieldInvalid('position') ? 'Obrigatório' : undefined}>
                  <Select value={form.position} onValueChange={(v) => update('position', v)}>
                    <SelectTrigger className={cn(isFieldInvalid('position') && 'border-red-400')}>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </Section>
            )}

            {/* ───────────── Contexto do Jogo ───────────── */}
            <Section title="Contexto do Jogo">
              <Field label="Competição">
                <Input
                  placeholder="Ex: Campeonato Nacional Sub-14"
                  value={form.competition}
                  onChange={(e) => update('competition', e.target.value)}
                />
              </Field>
              <Field label="Jogo">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Equipa casa"
                    className="flex-1"
                    value={form.match?.split(' vs ')[0] ?? ''}
                    onChange={(e) => {
                      const away = form.match?.split(' vs ')[1] ?? '';
                      update('match', `${e.target.value} vs ${away}`);
                    }}
                  />
                  <span className="text-xs font-bold text-muted-foreground shrink-0">vs</span>
                  <Input
                    placeholder="Equipa fora"
                    className="flex-1"
                    value={form.match?.split(' vs ')[1] ?? ''}
                    onChange={(e) => {
                      const home = form.match?.split(' vs ')[0] ?? '';
                      update('match', `${home} vs ${e.target.value}`);
                    }}
                  />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data do jogo">
                  <Input
                    type="date"
                    value={form.matchDate}
                    onChange={(e) => update('matchDate', e.target.value)}
                  />
                </Field>
                <Field label="Resultado">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      placeholder="0"
                      className="w-16 text-center"
                      value={form.matchResult?.split('-')[0] ?? ''}
                      onChange={(e) => {
                        const away = form.matchResult?.split('-')[1] ?? '';
                        update('matchResult', `${e.target.value}-${away}`);
                      }}
                    />
                    <span className="text-sm font-bold text-muted-foreground">-</span>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      placeholder="0"
                      className="w-16 text-center"
                      value={form.matchResult?.split('-')[1] ?? ''}
                      onChange={(e) => {
                        const home = form.matchResult?.split('-')[0] ?? '';
                        update('matchResult', `${home}-${e.target.value}`);
                      }}
                    />
                  </div>
                </Field>
              </div>
            </Section>

            {/* ───────────── Avaliação ───────────── */}
            <Section title="Avaliação">
              <Field label="Perfil físico">
                <Textarea
                  placeholder="Descrição do perfil físico do jogador..."
                  value={form.physicalProfile}
                  onChange={(e) => update('physicalProfile', e.target.value)}
                  rows={2}
                />
              </Field>
              <Field label="Pontos fortes">
                <Textarea
                  placeholder="Principais qualidades observadas..."
                  value={form.strengths}
                  onChange={(e) => update('strengths', e.target.value)}
                  rows={3}
                />
              </Field>
              <Field label="Pontos fracos">
                <Textarea
                  placeholder="Aspetos a melhorar..."
                  value={form.weaknesses}
                  onChange={(e) => update('weaknesses', e.target.value)}
                  rows={3}
                />
              </Field>

              {/* Rating stars */}
              <Field label="Avaliação *" error={isFieldInvalid('rating') ? 'Obrigatório' : undefined}>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'flex gap-0.5',
                    isFieldInvalid('rating') && 'rounded-md ring-1 ring-red-400 p-1',
                  )}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => update('rating', form.rating === star ? undefined : star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-0.5"
                      >
                        <Star
                          className={cn(
                            'h-7 w-7 transition-colors',
                            star <= (hoverRating || form.rating || 0)
                              ? `fill-current ${RATING_COLORS[hoverRating || form.rating || star].text}`
                              : 'text-neutral-300',
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  {(hoverRating || form.rating) && (
                    <span className={cn('text-sm font-medium', RATING_COLORS[hoverRating || form.rating!].text)}>
                      {RATING_LABELS[hoverRating || form.rating!]}
                    </span>
                  )}
                </div>
              </Field>

              <Field label="Decisão *" error={isFieldInvalid('decision') ? 'Obrigatório' : undefined}>
                <Select value={form.decision} onValueChange={(v) => update('decision', v)}>
                  <SelectTrigger className={cn(isFieldInvalid('decision') && 'border-red-400')}>
                    <SelectValue placeholder="Selecionar decisão" />
                  </SelectTrigger>
                  <SelectContent>
                    {DECISIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Contacto">
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="Nº de telefone"
                  value={form.contactInfo}
                  onChange={(e) => {
                    // Only keep digits and +
                    const raw = e.target.value.replace(/[^\d+]/g, '');
                    update('contactInfo', formatPhone(raw));
                  }}
                />
              </Field>
            </Section>

            {/* Submit */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              {isPending ? 'A submeter...' : 'Submeter relatório'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── UI Helpers ───────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const isRequired = label.endsWith('*');
  const text = isRequired ? label.slice(0, -2) : label;
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {text}{isRequired && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
