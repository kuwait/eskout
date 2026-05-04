// src/components/players/PlayerVideos.tsx
// "Media" section in player profile — compact YouTube video cards that open on YouTube
// All roles can view and add; admin/editor delete any, scout/recruiter delete own
// RELEVANT FILES: src/actions/player-videos.ts, src/components/players/PlayerProfile.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition } from 'react';
import { Play, Plus, X, Youtube, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      {/* Video list — compact rows */}
      {videos.length > 0 && (
        <div className="space-y-1.5">
          {videos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
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
    </>
  );
}

/* ───────────── Video Row (compact thumbnail + title → opens YouTube) ───────────── */

function VideoRow({
  video,
  onDelete,
}: {
  video: PlayerVideo;
  onDelete?: () => void;
}) {
  const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/default.jpg`;

  return (
    <div className="group flex items-center gap-2.5 rounded-lg border bg-card p-1.5 pr-2 transition-colors hover:bg-accent/30">
      {/* Compact thumbnail — opens YouTube */}
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative shrink-0 h-12 w-[80px] rounded overflow-hidden bg-neutral-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white">
            <Play className="h-2.5 w-2.5 ml-px" fill="currentColor" />
          </div>
        </div>
      </a>

      {/* Title + note */}
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1"
      >
        <p className="truncate text-xs font-medium leading-tight">
          {video.note || video.title || 'Vídeo'}
        </p>
        {video.note && video.title && (
          <p className="truncate text-[10px] text-muted-foreground leading-tight mt-0.5">
            {video.title}
          </p>
        )}
      </a>

      {/* Actions */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:text-destructive opacity-0 group-hover:opacity-100"
          title="Eliminar"
          aria-label="Eliminar vídeo"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
