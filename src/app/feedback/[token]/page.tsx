// src/app/feedback/[token]/page.tsx
// Public page for external coach feedback — no login required, validated by token
// Shows player first name + date, renders CoachFeedbackForm for evaluation
// RELEVANT FILES: src/app/api/feedback/[token]/route.ts, src/components/feedback/CoachFeedbackForm.tsx

import { createServiceClient } from '@/lib/supabase/server';
import { CoachFeedbackForm } from '@/components/feedback/CoachFeedbackForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
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
    .select('training_date, escalao, players!inner(name)')
    .eq('id', share.feedback_id)
    .single();

  if (!feedback) {
    return <ErrorPage message="Feedback não encontrado." />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullName = (feedback as any).players?.name ?? '';
  const firstName = fullName.split(' ')[0];
  const dateLabel = new Date(feedback.training_date).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <div className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-lg font-bold text-neutral-900">Feedback de Treino</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Avaliação de <span className="font-semibold text-neutral-700">{firstName}</span>
          </p>
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
