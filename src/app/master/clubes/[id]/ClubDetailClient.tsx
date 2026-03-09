// src/app/master/clubes/[id]/ClubDetailClient.tsx
// Client component for club detail — feature toggles, member management, invite form
// Used by the superadmin panel for per-club configuration
// RELEVANT FILES: src/app/master/clubes/[id]/page.tsx, src/actions/clubs.ts

'use client';

import { useState } from 'react';
import { Loader2, UserPlus, Trash2 } from 'lucide-react';
import { updateClub, inviteUserToClub, removeMembership, updateMembershipRole } from '@/actions/clubs';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { UserRole } from '@/lib/types';

const FEATURE_LABELS: Record<string, string> = {
  pipeline: 'Pipeline (Abordagens)',
  calendar: 'Calendário',
  shadow_squad: 'Plantel Sombra',
  scouting_reports: 'Relatórios de Observação',
  scout_submissions: 'Submissões Scout',
  export: 'Exportar',
  positions_view: 'Vista Posições',
  alerts: 'Notas Prioritárias',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  scout: 'Scout',
  recruiter: 'Recrutador',
};

interface Member {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  joinedAt: string;
}

export function ClubDetailClient({
  clubId,
  clubName,
  clubLogoUrl: initialLogoUrl,
  features: initialFeatures,
  isActive: initialIsActive,
  members,
}: {
  clubId: string;
  clubName: string;
  clubLogoUrl: string | null;
  features: Record<string, boolean>;
  isActive: boolean;
  members: Member[];
}) {
  const [features, setFeatures] = useState(initialFeatures);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [name, setName] = useState(clubName);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? '');
  const [saving, setSaving] = useState(false);

  // Deactivation confirmation dialog
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateConfirmText, setDeactivateConfirmText] = useState('');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('admin');
  const [inviting, setInviting] = useState(false);

  async function toggleFeature(key: string) {
    const updated = { ...features, [key]: !features[key] };
    setFeatures(updated);
    setSaving(true);
    const result = await updateClub(clubId, { features: updated });
    setSaving(false);
    if (!result.success) toast.error(result.error);
  }

  async function handleToggleActive() {
    // Activating doesn't need confirmation
    if (!isActive) {
      setSaving(true);
      const result = await updateClub(clubId, { isActive: true });
      setSaving(false);
      if (result.success) {
        setIsActive(true);
        toast.success('Clube ativado');
      } else {
        toast.error(result.error);
      }
      return;
    }
    // Deactivating — open confirmation dialog
    setDeactivateConfirmText('');
    setShowDeactivateDialog(true);
  }

  async function confirmDeactivate() {
    setShowDeactivateDialog(false);
    setSaving(true);
    const result = await updateClub(clubId, { isActive: false });
    setSaving(false);
    if (result.success) {
      setIsActive(false);
      toast.success('Clube desativado');
    } else {
      toast.error(result.error);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    const result = await inviteUserToClub(clubId, inviteEmail.trim(), inviteRole, inviteName.trim());
    setInviting(false);
    if (result.success) {
      toast.success('Utilizador convidado');
      setInviteEmail('');
      setInviteName('');
    } else {
      toast.error(result.error ?? 'Erro ao convidar');
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!confirm('Remover este membro?')) return;
    const result = await removeMembership(membershipId);
    if (result.success) toast.success('Membro removido');
    else toast.error(result.error ?? 'Erro');
  }

  async function handleRoleChange(membershipId: string, newRole: UserRole) {
    const result = await updateMembershipRole(membershipId, newRole);
    if (result.success) toast.success('Role atualizado');
    else toast.error(result.error ?? 'Erro');
  }

  async function handleDetailsSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('O nome do clube não pode estar vazio');
      return;
    }
    setSaving(true);
    const result = await updateClub(clubId, {
      name: trimmedName,
      logoUrl: logoUrl.trim() || undefined,
    });
    setSaving(false);
    if (result.success) toast.success('Dados do clube atualizados');
    else toast.error(result.error);
  }

  return (
    <div className="space-y-8">
      {/* Club details — name + logo */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold mb-3">Dados do Clube</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium" htmlFor="club-name">Nome</label>
            <input
              id="club-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              placeholder="Nome do clube"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="club-logo">Logo (URL)</label>
            <input
              id="club-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://exemplo.com/logo.png"
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">URL da imagem do logo (PNG, SVG, etc.)</p>
          </div>
          <Button size="sm" onClick={handleDetailsSave} disabled={saving}>
            Guardar
          </Button>
        </div>
      </div>

      {/* Active toggle */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Estado do Clube</p>
            <p className="text-sm text-muted-foreground">Clubes inativos não podem ser acedidos pelos membros</p>
          </div>
          <Button
            variant={isActive ? 'destructive' : 'default'}
            size="sm"
            onClick={handleToggleActive}
            disabled={saving}
          >
            {isActive ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      </div>

      {/* Deactivation confirmation dialog */}
      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar clube</DialogTitle>
            <DialogDescription>
              Todos os membros perdem acesso imediatamente. Para confirmar, escreve o nome do clube:
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-2 text-sm font-semibold">{clubName}</p>
            <input
              type="text"
              value={deactivateConfirmText}
              onChange={(e) => setDeactivateConfirmText(e.target.value)}
              placeholder="Escreve o nome do clube"
              className="w-full rounded-md border px-3 py-1.5 text-sm"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowDeactivateDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDeactivate}
              disabled={deactivateConfirmText !== clubName}
            >
              Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature toggles */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold mb-3">Funcionalidades</h2>
        <div className="space-y-2">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={features[key] !== false}
                onChange={() => toggleFeature(key)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Members */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold mb-3">Membros ({members.length})</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.membershipId} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.fullName}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <select
                value={m.role}
                onChange={(e) => handleRoleChange(m.membershipId, e.target.value as UserRole)}
                className="text-xs rounded border px-2 py-1"
              >
                {Object.entries(ROLE_LABELS).map(([val, lab]) => (
                  <option key={val} value={val}>{lab}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleRemoveMember(m.membershipId)}
                className="text-red-400 hover:text-red-600"
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Invite form */}
        <form onSubmit={handleInvite} className="mt-4 flex flex-wrap gap-2">
          <input
            type="text"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Nome"
            className="rounded-md border px-3 py-1.5 text-sm flex-1 min-w-[120px]"
            required
          />
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className="rounded-md border px-3 py-1.5 text-sm flex-1 min-w-[160px]"
            required
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as UserRole)}
            className="rounded-md border px-2 py-1.5 text-sm"
          >
            {Object.entries(ROLE_LABELS).map(([val, lab]) => (
              <option key={val} value={val}>{lab}</option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={inviting} className="gap-1">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Convidar
          </Button>
        </form>
      </div>
    </div>
  );
}
