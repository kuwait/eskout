// src/app/master/utilizadores/UsersClient.tsx
// Client component for superadmin users list — search, delete ghost users
// Shows all platform users with their club memberships and auth status
// RELEVANT FILES: src/app/master/utilizadores/page.tsx, src/actions/clubs.ts

'use client';

import { useState } from 'react';
import { Search, Trash2, CheckCircle, XCircle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { deleteUser } from '@/actions/master-users';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  scout: 'Scout',
  recruiter: 'Recrutador',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700',
  editor: 'bg-green-100 text-green-700',
  scout: 'bg-amber-100 text-amber-700',
  recruiter: 'bg-purple-100 text-purple-700',
};

/* ───────────── Search Helpers ───────────── */

/** Strip diacritics and lowercase for accent-insensitive matching */
function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Multi-field fuzzy search — all terms must match across name, email, or club names */
function filterUsers(users: UserRow[], query: string): UserRow[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return users;

  return users.filter((u) => {
    // Build searchable text: name, email, club names, roles
    const clubText = u.clubs.map((c) => `${c.clubName} ${ROLE_LABELS[c.role] ?? c.role}`).join(' ');
    const haystack = normalize(`${u.fullName} ${u.email} ${clubText}`);
    return terms.every((term) => haystack.includes(term));
  });
}

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  isSuperadmin: boolean;
  confirmed: boolean;
  lastSignIn: string | null;
  createdAt: string;
  clubs: { clubName: string; role: string }[];
}

export function UsersClient({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const filtered = filterUsers(users, search);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteUser(deleteTarget.id);
    setDeleting(false);
    if (result.success) {
      toast.success('Utilizador eliminado');
      setDeleteTarget(null);
      setDeleteConfirmText('');
      router.refresh();
    } else {
      toast.error(result.error ?? 'Erro ao eliminar');
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Utilizadores ({users.length})</h1>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por nome ou email"
          className="w-full rounded-md border pl-9 pr-3 py-1.5 text-sm"
        />
      </div>

      {/* Users table — desktop */}
      <div className="hidden md:block rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Utilizador</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Clubes</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Último login</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Criado</th>
              <th className="px-4 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-medium">
                        {u.fullName}
                        {u.isSuperadmin && (
                          <Shield className="inline ml-1 h-3.5 w-3.5 text-purple-600" />
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.confirmed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle className="h-3.5 w-3.5" /> Confirmado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-500">
                      <XCircle className="h-3.5 w-3.5" /> Pendente
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.clubs.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Nenhum</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.clubs.map((c, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${ROLE_COLORS[c.role] ?? 'bg-neutral-100 text-neutral-700'}`}
                        >
                          {c.clubName} · {ROLE_LABELS[c.role] ?? c.role}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(u.lastSignIn)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  {!u.isSuperadmin && (
                    <button
                      type="button"
                      onClick={() => { setDeleteTarget(u); setDeleteConfirmText(''); }}
                      className="text-red-400 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Users cards — mobile */}
      <div className="md:hidden space-y-3">
        {filtered.map((u) => (
          <div key={u.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {u.fullName}
                  {u.isSuperadmin && (
                    <Shield className="inline ml-1 h-3.5 w-3.5 text-purple-600" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {u.confirmed ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                {!u.isSuperadmin && (
                  <button
                    type="button"
                    onClick={() => { setDeleteTarget(u); setDeleteConfirmText(''); }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {u.clubs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {u.clubs.map((c, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${ROLE_COLORS[c.role] ?? 'bg-neutral-100 text-neutral-700'}`}
                  >
                    {c.clubName} · {ROLE_LABELS[c.role] ?? c.role}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
              <span>Login: {formatDate(u.lastSignIn)}</span>
              <span>Criado: {formatDate(u.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum utilizador encontrado</p>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar utilizador</DialogTitle>
            <DialogDescription>
              Esta ação remove o utilizador da autenticação e todas as suas memberships. Para confirmar, escreve o email:
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-2 text-sm font-semibold">{deleteTarget?.email}</p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Escreve o email do utilizador"
              className="w-full rounded-md border px-3 py-1.5 text-sm"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteConfirmText !== deleteTarget?.email || deleting}
            >
              {deleting ? 'A eliminar...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
