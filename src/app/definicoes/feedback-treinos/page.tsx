// src/app/definicoes/feedback-treinos/page.tsx
// Admin page listing all training feedbacks for the club, ordered by most recent
// Gives admins a consolidated view of all player training evaluations across all escalões
// RELEVANT FILES: src/lib/supabase/queries.ts, src/app/definicoes/feedback-treinos/FeedbackTreinosClient.tsx, src/actions/training-feedback.ts

import { getAllTrainingFeedbacks } from '@/lib/supabase/queries';
import { FeedbackTreinosClient } from './FeedbackTreinosClient';

export default async function FeedbackTreinosPage() {
  const feedbacks = await getAllTrainingFeedbacks();

  return <FeedbackTreinosClient feedbacks={feedbacks} />;
}
