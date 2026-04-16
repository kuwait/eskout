// src/app/api/feedback/[token]/route.ts
// Public API for external coach feedback — no auth required, validated by token
// GET: returns player first name + training date + escalao. POST: submits coach feedback
// RELEVANT FILES: src/app/feedback/[token]/page.tsx, src/actions/training-feedback.ts, src/lib/validators.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { coachFeedbackSchema } from '@/lib/validators';

/* ───────────── GET: Load feedback context for the coach ───────────── */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = await createServiceClient();

  // Validate token: exists, not expired, not used, not revoked
  const { data: share } = await supabase
    .from('feedback_share_tokens')
    .select('id, feedback_id, expires_at, used_at, revoked_at')
    .eq('token', token)
    .single();

  if (!share) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
  }

  if (share.revoked_at) {
    return NextResponse.json({ error: 'Link revogado' }, { status: 410 });
  }
  if (share.used_at) {
    return NextResponse.json({ error: 'Link já utilizado' }, { status: 410 });
  }
  if (new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expirado' }, { status: 410 });
  }

  // Get feedback + player first name (minimal data exposure)
  const { data: feedback } = await supabase
    .from('training_feedback')
    .select('training_date, escalao, players!inner(name)')
    .eq('id', share.feedback_id)
    .single();

  if (!feedback) {
    return NextResponse.json({ error: 'Feedback não encontrado' }, { status: 404 });
  }

  // Only expose first name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullName = (feedback as any).players?.name ?? '';
  const firstName = fullName.split(' ')[0];

  return NextResponse.json({
    playerFirstName: firstName,
    trainingDate: feedback.training_date,
    escalao: feedback.escalao,
  });
}

/* ───────────── POST: Submit coach feedback ───────────── */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = await createServiceClient();

  // Validate token
  const { data: share } = await supabase
    .from('feedback_share_tokens')
    .select('id, feedback_id, expires_at, used_at, revoked_at')
    .eq('token', token)
    .single();

  if (!share) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
  }
  if (share.revoked_at || share.used_at || new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expirado ou já utilizado' }, { status: 410 });
  }

  // Parse and validate body — limit size to prevent abuse
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > 50_000) {
    return NextResponse.json({ error: 'Payload demasiado grande' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = coachFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data = parsed.data;
  const now = new Date().toISOString();

  // Update training_feedback with coach data
  // Migration 107: coach submit → status=realizado (transição implícita)
  const { error: updateError } = await supabase
    .from('training_feedback')
    .update({
      status: 'realizado',
      coach_feedback: data.feedback,
      coach_rating: data.ratingPerformance,
      coach_decision: data.decision,
      coach_rating_performance: data.ratingPerformance,
      coach_rating_potential: data.ratingPotential,
      coach_maturation: data.maturation ?? null,
      coach_height_scale: data.heightScale ?? null,
      coach_build_scale: data.buildScale ?? null,
      coach_speed_scale: data.speedScale ?? null,
      coach_intensity_scale: data.intensityScale ?? null,
      coach_tags: data.tags,
      coach_observed_position: data.observedPosition || null,
      coach_name: data.coachName || null,
      coach_submitted_at: now,
    })
    .eq('id', share.feedback_id);

  if (updateError) {
    return NextResponse.json({ error: 'Erro ao guardar feedback' }, { status: 500 });
  }

  // Mark token as used
  await supabase
    .from('feedback_share_tokens')
    .update({ used_at: now, coach_name: data.coachName || null })
    .eq('id', share.id);

  return NextResponse.json({ success: true });
}
