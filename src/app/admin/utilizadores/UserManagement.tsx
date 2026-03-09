// src/app/admin/utilizadores/UserManagement.tsx
// Client component for user management — invite form, search, user list with role editing and soft delete
// Handles all user interactions, calls server actions for mutations
// RELEVANT FILES: src/actions/users.ts, src/app/admin/utilizadores/page.tsx, src/lib/types/index.ts

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, RotateCcw, Search, Trash2, UserPlus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inviteUser, updateUserRole, deleteUser, reactivateUser, type UserListItem } from '@/actions/users';
import type { UserRole } from '@/lib/types';

/* ───────────── Constants ───────────── */

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  scout: 'Scout',
  recruiter: 'Recrutador',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  editor: 'bg-blue-100 text-blue-700',
  scout: 'bg-neutral-100 text-neutral-700',
  recruiter: 'bg-purple-100 text-purple-700',
};

/* ───────────── Helpers ───────────── */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 30) return `${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 mes' : `${months} meses`;
}

// Fuzzy search — matches if all search terms appear anywhere in the combined text
function fuzzyMatch(query: string, ...fields: string[]): boolean {
  const combined = fields.join(' ').toLowerCase();
  const terms = query.toLowerCase().trim().split(/\s+/);
  return terms.every((term) => combined.includes(term));
}

/* ───────────── Main Component ───────────── */

interface UserManagementProps {
  initialUsers: UserListItem[];
}

export function UserManagement({ initialUsers }: UserManagementProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search
  const [search, setSearch] = useState('');

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('editor');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);

  // Filtered users — fuzzy search on name, email, role label
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return initialUsers;
    return initialUsers.filter((u) =>
      fuzzyMatch(search, u.fullName, u.email, ROLE_LABELS[u.role]),
    );
  }, [initialUsers, search]);

  function showFeedback(type: 'success' | 'error', message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  function handleInvite() {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    startTransition(async () => {
      const result = await inviteUser(inviteEmail.trim(), inviteRole, inviteName.trim());
      if (result.success) {
        showFeedback('success', `Convite enviado para ${inviteEmail}`);
        setInviteEmail('');
        setInviteName('');
        setShowInvite(false);
        router.refresh();
      } else {
        showFeedback('error', result.error ?? 'Erro ao convidar');
      }
    });
  }

  function handleRoleChange(userId: string, newRole: UserRole) {
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      if (result.success) {
        showFeedback('success', 'Role atualizado');
        router.refresh();
      } else {
        showFeedback('error', result.error ?? 'Erro ao atualizar');
      }
    });
  }

  function handleDeactivate() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteUser(deleteTarget.id);
      if (result.success) {
        showFeedback('success', `${deleteTarget.fullName} desativado`);
        setDeleteTarget(null);
        router.refresh();
      } else {
        showFeedback('error', result.error ?? 'Erro ao desativar');
      }
    });
  }

  function handleReactivate(user: UserListItem) {
    startTransition(async () => {
      const result = await reactivateUser(user.id);
      if (result.success) {
        showFeedback('success', `${user.fullName} reativado`);
        router.refresh();
      } else {
        showFeedback('error', result.error ?? 'Erro ao reativar');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Feedback banner */}
      {feedback && (
        <div className={`rounded-md border px-4 py-2 text-sm ${
          feedback.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Top bar — invite + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!showInvite ? (
          <Button size="sm" onClick={() => setShowInvite(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Convidar utilizador
          </Button>
        ) : (
          <div className="w-full rounded-lg border bg-white p-4 space-y-3">
            <p className="text-sm font-semibold">Novo utilizador</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Nome completo"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
              <Input
                type="email"
                placeholder="Email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="scout">Scout</SelectItem>
                  <SelectItem value="recruiter">Recrutador</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => setShowInvite(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleInvite} disabled={isPending || !inviteEmail.trim() || !inviteName.trim()}>
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  {isPending ? 'A enviar...' : 'Enviar convite'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Search bar */}
        {!showInvite && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        )}
      </div>

      {/* User list */}
      <div className="rounded-lg border bg-white">
        {/* Desktop table */}
        <div className="hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-neutral-50 text-left text-xs font-semibold uppercase text-muted-foreground">
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Ultimo acesso</th>
                <th className="px-4 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className={`border-b last:border-0 ${!user.active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium">
                    {user.fullName}
                    {!user.active && (
                      <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 uppercase">
                        Desativado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={user.role}
                      onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                      disabled={isPending || !user.active}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[user.role]}`}>
                          {ROLE_LABELS[user.role]}
                        </span>
                      </SelectTrigger>
                      <SelectContent position="popper" align="start" sideOffset={4}>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="scout">Scout</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(user.lastSignIn)}</td>
                  <td className="px-4 py-3">
                    {user.active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                        onClick={() => setDeleteTarget(user)}
                        title="Desativar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-600"
                        onClick={() => handleReactivate(user)}
                        disabled={isPending}
                        title="Reativar"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {search.trim() ? 'Nenhum resultado' : 'Nenhum utilizador encontrado'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className={`flex items-center gap-3 px-4 py-3 ${!user.active ? 'opacity-50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {user.fullName}
                  {!user.active && (
                    <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 uppercase">
                      Desativado
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[user.role]}`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{timeAgo(user.lastSignIn)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Select
                  value={user.role}
                  onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                  disabled={isPending || !user.active}
                >
                  <SelectTrigger className="h-7 w-28 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="scout">Scout</SelectItem>
                    <SelectItem value="recruiter">Recrutador</SelectItem>
                  </SelectContent>
                </Select>
                {user.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                    onClick={() => setDeleteTarget(user)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-600"
                    onClick={() => handleReactivate(user)}
                    disabled={isPending}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {filteredUsers.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              {search.trim() ? 'Nenhum resultado' : 'Nenhum utilizador encontrado'}
            </div>
          )}
        </div>
      </div>

      {/* Deactivate confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar utilizador</AlertDialogTitle>
            <AlertDialogDescription>
              Tens a certeza que queres desativar <strong>{deleteTarget?.fullName}</strong> ({deleteTarget?.email})?
              O utilizador não poderá aceder à aplicação mas o nome será preservado em avaliações e relatórios.
              Podes reativar a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} className="bg-red-600 hover:bg-red-700">
              {isPending ? 'A desativar...' : 'Desativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
