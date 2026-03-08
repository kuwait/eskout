// src/app/master/clubes/CreateClubForm.tsx
// Form to create a new club from the superadmin panel
// Auto-generates slug from name, seeds age groups after creation
// RELEVANT FILES: src/app/master/clubes/page.tsx, src/actions/clubs.ts

'use client';

import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { createClub, seedAgeGroupsForClub } from '@/actions/clubs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function CreateClubForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-generate slug from name
  function handleNameChange(value: string) {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setLoading(true);
    try {
      const result = await createClub({ name: name.trim(), slug: slug.trim(), logoUrl: logoUrl.trim() || undefined });
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao criar clube');
        return;
      }

      // Seed age groups
      await seedAgeGroupsForClub(result.data!.id);

      toast.success('Clube criado com sucesso');
      setName('');
      setSlug('');
      setLogoUrl('');
      setOpen(false);
    } catch {
      toast.error('Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline" className="gap-2">
        <Plus className="h-4 w-4" />
        Criar Clube
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4 space-y-3">
      <div>
        <label className="text-sm font-medium">Nome</label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Boavista FC"
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium">Slug (URL)</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="boavista"
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium">Logo URL (opcional)</label>
        <input
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://..."
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading} className="gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Criar
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
