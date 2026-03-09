// src/app/admin/relatorios/[id]/page.tsx
// Admin detail view of a scouting report with approve/reject actions
// Approve creates a player (or links to existing); reject marks as rejected
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/admin/relatorios/page.tsx, src/app/meus-relatorios/[id]/page.tsx

import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ExternalLink, Star, User } from 'lucide-react';
import { getScoutReport } from '@/actions/scout-reports';
import { AdminReportActions } from './AdminReportActions';

/* ───────────── Constants ───────────── */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-700' },
  aprovado: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-700' },
  rejeitado: { label: 'Rejeitado', className: 'bg-red-100 text-red-700' },
};

const RATING_LABELS: Record<number, string> = {
  1: 'Fraco', 2: 'Dúvida', 3: 'Bom', 4: 'Muito Bom', 5: 'Excelente',
};

const RATING_COLORS: Record<number, string> = {
  1: 'text-red-500', 2: 'text-orange-500', 3: 'text-blue-500', 4: 'text-emerald-500', 5: 'text-emerald-600',
};

/* ───────────── Page ───────────── */

export default async function AdminReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = parseInt(id, 10);
  if (isNaN(reportId)) notFound();

  const { report } = await getScoutReport(reportId);
  if (!report) notFound();

  const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pendente;
  const spd = report.submissionPlayerData;

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin/relatorios" className="shrink-0 rounded-md p-1.5 hover:bg-neutral-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold">{report.playerName}</h1>
            <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
              {status.label}
            </span>
            {report.source === 'pdf' && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-neutral-400">PDF</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {report.playerClub}
            {report.authorName && <span> · por {report.authorName}</span>}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* ───────────── Dados do Jogador ───────────── */}
        <Section title="Dados do Jogador">
          <div className="flex gap-3">
            {spd?.photoUrl ? (
              <Image src={spd.photoUrl} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-lg object-cover" unoptimized />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                <User className="h-5 w-5 text-neutral-300" />
              </div>
            )}
            <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Detail label="Nome" value={report.playerName} />
              <Detail label="Clube" value={report.playerClub} />
              <Detail label="Posição" value={[report.position, spd?.secondaryPosition, spd?.tertiaryPosition].filter(Boolean).join(' / ')} />
              <Detail label="Pé" value={report.foot} />
              <Detail label="Ano nascimento" value={report.birthYear} />
              {spd?.dob && <Detail label="Data nascimento" value={new Date(spd.dob).toLocaleDateString('pt-PT')} />}
              <Detail label="Nº camisola" value={report.shirtNumber} />
              <Detail label="Nacionalidade" value={spd?.nationality} />
              {spd?.birthCountry && spd.birthCountry !== spd.nationality && (
                <Detail label="País nascimento" value={spd.birthCountry} />
              )}
              {spd?.height && <Detail label="Altura" value={`${spd.height} cm`} />}
              {spd?.weight && <Detail label="Peso" value={`${spd.weight} kg`} />}
            </div>
          </div>

          {/* Links */}
          <div className="mt-3 flex flex-wrap gap-3">
            {spd?.fpfLink && (
              <a href={spd.fpfLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                FPF <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {spd?.zerozeroLink && (
              <a href={spd.zerozeroLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                ZeroZero <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </Section>

        {/* ───────────── Contexto do Jogo ───────────── */}
        {(report.competition || report.match || report.matchDate || report.matchResult) && (
          <Section title="Contexto do Jogo">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Detail label="Competição" value={report.competition} span={2} />
              <Detail label="Jogo" value={report.match} />
              <Detail label="Resultado" value={report.matchResult} />
              {report.matchDate && (
                <Detail label="Data" value={new Date(report.matchDate).toLocaleDateString('pt-PT')} />
              )}
            </div>
          </Section>
        )}

        {/* ───────────── Avaliação ───────────── */}
        <Section title="Avaliação">
          <div className="flex items-center gap-4">
            {report.rating && (
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`h-4 w-4 ${
                        s <= report.rating! ? `fill-current ${RATING_COLORS[report.rating!]}` : 'text-neutral-200'
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-sm font-medium ${RATING_COLORS[report.rating]}`}>
                  {RATING_LABELS[report.rating]}
                </span>
              </div>
            )}
            {report.decision && (
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                {report.decision}
              </span>
            )}
          </div>

          {report.physicalProfile && <TextBlock label="Perfil físico" value={report.physicalProfile} />}
          {report.strengths && <TextBlock label="Pontos fortes" value={report.strengths} variant="positive" />}
          {report.weaknesses && <TextBlock label="Pontos fracos" value={report.weaknesses} variant="negative" />}
          {report.analysis && <TextBlock label="Análise geral" value={report.analysis} />}
        </Section>

        {/* ───────────── Contacto ───────────── */}
        {report.contactInfo && (
          <Section title="Contacto">
            <p className="text-sm">{report.contactInfo}</p>
          </Section>
        )}

        {/* ───────────── Actions ───────────── */}
        <AdminReportActions
          reportId={report.id}
          status={report.status}
          linkedPlayerId={report.playerId}
        />

        {/* Meta */}
        <p className="text-center text-xs text-muted-foreground">
          Submetido a {new Date(report.createdAt).toLocaleDateString('pt-PT')} às{' '}
          {new Date(report.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
        </p>
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

function Detail({ label, value, span }: { label: string; value: string | null | undefined; span?: number }) {
  if (!value) return null;
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function TextBlock({ label, value, variant }: { label: string; value: string; variant?: 'positive' | 'negative' }) {
  const icon = variant === 'positive' ? '+' : variant === 'negative' ? '−' : null;
  const iconColor = variant === 'positive' ? 'text-emerald-600' : variant === 'negative' ? 'text-red-500' : '';
  return (
    <div>
      <p className="mb-0.5 text-xs text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">
        {icon && <span className={`font-medium ${iconColor}`}>{icon} </span>}
        {value}
      </p>
    </div>
  );
}
