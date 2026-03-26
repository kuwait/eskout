// src/app/feedback/[token]/page.tsx
// Public page for external coach feedback — no login required, validated by token
// Shows player first name + date, renders CoachFeedbackForm for evaluation
// RELEVANT FILES: src/app/api/feedback/[token]/route.ts, src/components/feedback/CoachFeedbackForm.tsx

import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase/server';
import { CoachFeedbackForm } from '@/components/feedback/CoachFeedbackForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

/* ───────────── OG Meta for WhatsApp/social preview ───────────── */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const supabase = await createServiceClient();

  const { data: share } = await supabase
    .from('feedback_share_tokens')
    .select('feedback_id')
    .eq('token', token)
    .single();

  if (!share) {
    return { title: 'Feedback de Treino — Eskout' };
  }

  const { data: feedback } = await supabase
    .from('training_feedback')
    .select('training_date, escalao, players!inner(name)')
    .eq('id', share.feedback_id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerName = (feedback as any)?.players?.name?.split(' ')[0] ?? 'Jogador';
  const dateLabel = feedback?.training_date
    ? new Date(feedback.training_date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  const escalao = feedback?.escalao ?? '';

  const title = `Avaliação de Treino — ${playerName}`;
  const description = `Preenche o feedback do treino de ${playerName}${escalao ? ` (${escalao})` : ''}${dateLabel ? ` — ${dateLabel}` : ''}. Eskout — Plataforma de Scouting.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Eskout',
    },
  };
}

export default async function CoachFeedbackPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createServiceClient();

  // Validate token
  const { data: share } = await supabase
    .from('feedback_share_tokens')
    .select('id, feedback_id, expires_at, used_at, revoked_at')
    .eq('token', token)
    .single();

  if (!share) {
    return <ErrorPage message="Link inválido ou não encontrado." />;
  }
  if (share.revoked_at) {
    return <ErrorPage message="Este link foi revogado." />;
  }
  if (share.used_at) {
    return <ErrorPage message="O feedback já foi submetido através deste link." />;
  }
  if (new Date(share.expires_at) < new Date()) {
    return <ErrorPage message="Este link expirou." />;
  }

  // Get feedback + player name
  const { data: feedback } = await supabase
    .from('training_feedback')
    .select('training_date, escalao, players!inner(name, club, position_normalized, photo_url, zz_photo_url)')
    .eq('id', share.feedback_id)
    .single();

  if (!feedback) {
    return <ErrorPage message="Feedback não encontrado." />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player = (feedback as any).players ?? {};
  const firstName = (player.name ?? '').split(' ')[0];
  const club = player.club ?? '';
  const position = player.position_normalized ?? '';
  const photoUrl = player.photo_url || player.zz_photo_url || null;
  const dateLabel = new Date(feedback.training_date).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <div className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header — player card */}
        <div className="mb-6 flex flex-col items-center text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-neutral-400">Avaliação de Treino</p>
          {/* Photo */}
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external URL, may have CORS issues with next/image
            <img src={photoUrl} alt={firstName} className="h-16 w-16 rounded-full border-2 border-white object-cover shadow-md" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200 text-xl font-bold text-neutral-400 shadow-md">
              {firstName.charAt(0)}
            </div>
          )}
          <h1 className="mt-3 text-lg font-bold text-neutral-900">{firstName}</h1>
          {/* Club + position */}
          <div className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
            {club && <span>{club}</span>}
            {club && position && <span className="text-neutral-300">·</span>}
            {position && <span className="font-medium text-neutral-600">{position}</span>}
          </div>
          {/* Date + escalão */}
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-600 border">{dateLabel}</span>
            {feedback.escalao && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">{feedback.escalao}</span>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <CoachFeedbackForm token={token} />
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[10px] text-neutral-400">
          Eskout · Plataforma de Scouting
        </p>
      </div>
    </div>
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4">
      <div className="text-center">
        <p className="text-4xl">⚽</p>
        <p className="mt-3 text-sm font-medium text-neutral-600">{message}</p>
        <p className="mt-1 text-xs text-neutral-400">Contacte quem lhe enviou o link.</p>
      </div>
    </div>
  );
}
