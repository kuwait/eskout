// src/components/players/PlayerVideos.tsx
// "Media" section in player profile — YouTube video cards with inline embed modal
// All roles can view and add; admin/editor delete any, scout/recruiter delete own
// RELEVANT FILES: src/actions/player-videos.ts, src/components/players/PlayerProfile.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition } from 'react';
import { Play, Plus, X, Youtube, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { addPlayerVideo, deletePlayerVideo } from '@/actions/player-videos';
import { toast } from 'sonner';
import type { PlayerVideo, UserRole } from '@/lib/types';

/* ───────────── Constants ───────────── */

const MAX_VIDEOS = 10;

/* ───────────── Component ───────────── */

export function PlayerVideos({
  playerId,
  videos: initialVideos,
  userRole,
  currentUserId,
}: {
  playerId: number;
  videos: PlayerVideo[];
  userRole: UserRole;
  currentUserId: string | null;
}) {
  const [videos, setVideos] = useState(initialVideos);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();
  const [embedVideo, setEmbedVideo] = useState<PlayerVideo | null>(null);

  const canDelete = (video: PlayerVideo) =>
    userRole === 'admin' || userRole === 'editor' || video.addedBy === currentUserId;

  function handleAdd() {
    if (!url.trim()) return;
    startTransition(async () => {
      const res = await addPlayerVideo({ playerId, url: url.trim(), note: note.trim() || undefined });
      if (res.success && res.data) {
        setVideos((prev) => [res.data!, ...prev]);
        setUrl('');
        setNote('');
        setShowForm(false);
        toast.success('Vídeo adicionado');
      } else {
        toast.error(res.error ?? 'Erro ao adicionar');
      }
    });
  }

  function handleDelete(video: PlayerVideo) {
    startTransition(async () => {
      const res = await deletePlayerVideo(video.id, playerId);
      if (res.success) {
        setVideos((prev) => prev.filter((v) => v.id !== video.id));
        toast.success('Vídeo eliminado');
      } else {
        toast.error(res.error ?? 'Erro ao eliminar');
      }
    });
  }

  return (
    <>
      {/* Video grid */}
      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onPlay={() => setEmbedVideo(video)}
              onDelete={canDelete(video) ? () => handleDelete(video) : undefined}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {videos.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground">Sem vídeos.</p>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="mt-2 space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="relative">
            <Youtube className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-8 pl-8 text-xs"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
            />
          </div>
          <Input
            placeholder="Nota (opcional) — ex: Golo vs Benfica Sub-15"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 text-xs"
            maxLength={100}
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowForm(false); setUrl(''); setNote(''); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={isPending || !url.trim()}>
              {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Adicionar
            </Button>
          </div>
        </div>
      ) : (
        videos.length < MAX_VIDEOS && (
          <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs text-muted-foreground" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Adicionar vídeo
          </Button>
        )
      )}

      {/* Embed modal */}
      <Dialog open={!!embedVideo} onOpenChange={(open) => { if (!open) setEmbedVideo(null); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">{embedVideo?.title ?? 'Vídeo'}</DialogTitle>
          {embedVideo && (
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${embedVideo.videoId}?autoplay=1`}
                title={embedVideo.title ?? 'Vídeo'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          )}
          {embedVideo?.note && (
            <p className="px-4 py-2 text-sm text-muted-foreground">{embedVideo.note}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── Video Card ───────────── */

function VideoCard({
  video,
  onPlay,
  onDelete,
}: {
  video: PlayerVideo;
  onPlay: () => void;
  onDelete?: () => void;
}) {
  const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card">
      {/* Thumbnail with play overlay */}
      <button
        type="button"
        onClick={onPlay}
        className="relative block w-full aspect-video bg-neutral-100 overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={video.title ?? ''}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
            <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
          </div>
        </div>
      </button>

      {/* Info */}
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-medium leading-tight">
          {video.note || video.title || 'Vídeo'}
        </p>
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
          title="Eliminar"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
