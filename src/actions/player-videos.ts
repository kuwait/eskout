// src/actions/player-videos.ts
// Server Actions for player YouTube video links
// Supports add/delete with YouTube oEmbed metadata extraction (title + thumbnail)
// RELEVANT FILES: src/components/players/PlayerVideos.tsx, src/lib/types/index.ts, src/lib/validators.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import { addVideoSchema } from '@/lib/validators';
import type { ActionResponse, PlayerVideo, PlayerVideoRow } from '@/lib/types';

/* ───────────── Constants ───────────── */

const MAX_VIDEOS_PER_PLAYER = 10;

/* ───────────── Helpers ───────────── */

function mapRow(row: PlayerVideoRow): PlayerVideo {
  return {
    id: row.id,
    clubId: row.club_id,
    playerId: row.player_id,
    url: row.url,
    videoId: row.video_id,
    title: row.title,
    thumbnail: row.thumbnail,
    note: row.note,
    addedBy: row.added_by,
    createdAt: row.created_at,
  };
}

/** Extract YouTube video ID from various URL formats */
function extractVideoId(url: string): string | null {
  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtube.com/shorts/VIDEO_ID
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  return null;
}

/** Fetch title + thumbnail from YouTube oEmbed (no API key needed) */
async function fetchOembedMetadata(url: string): Promise<{ title: string; thumbnail: string } | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title ?? null,
      thumbnail: data.thumbnail_url ?? null,
    };
  } catch {
    // oEmbed is best-effort — don't fail the whole operation
    return null;
  }
}

/* ───────────── Queries ───────────── */

/** Get all videos for a player */
export async function getPlayerVideos(playerId: number): Promise<PlayerVideo[]> {
  const ctx = await getAuthContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('player_videos')
    .select('*')
    .eq('club_id', ctx.clubId)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getPlayerVideos error:', error);
    return [];
  }

  return (data as PlayerVideoRow[]).map(mapRow);
}

/* ───────────── Mutations ───────────── */

/** Add a video to a player */
export async function addPlayerVideo(
  input: { playerId: number; url: string; note?: string },
): Promise<ActionResponse<PlayerVideo>> {
  const parsed = addVideoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const videoId = extractVideoId(parsed.data.url);
  if (!videoId) {
    return { success: false, error: 'Não foi possível extrair o ID do vídeo' };
  }

  const ctx = await getAuthContext();
  const supabase = await createClient();

  // Check limit
  const { count } = await supabase
    .from('player_videos')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', ctx.clubId)
    .eq('player_id', parsed.data.playerId);

  if ((count ?? 0) >= MAX_VIDEOS_PER_PLAYER) {
    return { success: false, error: `Máximo de ${MAX_VIDEOS_PER_PLAYER} vídeos por jogador` };
  }

  // Check duplicate video_id
  const { data: existing } = await supabase
    .from('player_videos')
    .select('id')
    .eq('club_id', ctx.clubId)
    .eq('player_id', parsed.data.playerId)
    .eq('video_id', videoId)
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'Este vídeo já foi adicionado' };
  }

  // Fetch metadata from YouTube oEmbed (best-effort)
  const metadata = await fetchOembedMetadata(parsed.data.url);

  const { data, error } = await supabase
    .from('player_videos')
    .insert({
      club_id: ctx.clubId,
      player_id: parsed.data.playerId,
      url: parsed.data.url,
      video_id: videoId,
      title: metadata?.title ?? null,
      thumbnail: metadata?.thumbnail ?? null,
      note: parsed.data.note ?? null,
      added_by: ctx.userId,
    })
    .select()
    .single();

  if (error) {
    console.error('addPlayerVideo error:', error);
    return { success: false, error: 'Erro ao adicionar vídeo' };
  }

  const video = mapRow(data as PlayerVideoRow);

  await broadcastRowMutation(ctx.clubId, 'player_videos', 'INSERT', ctx.userId, video.id);
  revalidatePath(`/jogadores/${parsed.data.playerId}`);
  return { success: true, data: video };
}

/** Delete a video */
export async function deletePlayerVideo(videoId: number, playerId: number): Promise<ActionResponse> {
  const ctx = await getAuthContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from('player_videos')
    .delete()
    .eq('id', videoId)
    .eq('club_id', ctx.clubId);

  if (error) {
    console.error('deletePlayerVideo error:', error);
    return { success: false, error: 'Erro ao eliminar vídeo' };
  }

  await broadcastRowMutation(ctx.clubId, 'player_videos', 'DELETE', ctx.userId, videoId);
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
