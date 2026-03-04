// src/components/players/PlayerProfile.tsx
// Full player profile with collapsible sections for basic info, links, reports, recruitment
// Displays all player data with admin edit capabilities
// RELEVANT FILES: src/app/jogadores/[id]/page.tsx, src/components/common/OpinionBadge.tsx, src/components/common/StatusBadge.tsx

'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { POSITION_LABELS } from '@/lib/constants';
import type { Player, PositionCode, UserRole } from '@/lib/types';

interface PlayerProfileProps {
  player: Player;
  userRole: UserRole;
}

export function PlayerProfile({ player }: PlayerProfileProps) {

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/jogadores">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar
        </Link>
      </Button>

      {/* ───────────── Header ───────────── */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{player.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {player.positionNormalized && (
            <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium">
              {player.positionNormalized} — {POSITION_LABELS[player.positionNormalized as PositionCode]}
            </span>
          )}
          {player.foot && <span className="text-muted-foreground">Pé: {player.foot}</span>}
          <OpinionBadge opinion={player.departmentOpinion} />
          <StatusBadge status={player.recruitmentStatus} />
        </div>
      </div>

      <Separator />

      {/* ───────────── Informação Básica ───────────── */}
      <ProfileSection title="Informação Básica" defaultOpen>
        <InfoGrid>
          <InfoItem label="Data Nascimento" value={player.dob ? formatDate(player.dob) : '—'} />
          <InfoItem label="Clube" value={player.club || '—'} />
          <InfoItem label="Número" value={player.shirtNumber || '—'} />
          <InfoItem label="Contacto" value={player.contact || '—'} />
          <InfoItem label="Referenciado por" value={player.referredBy || '—'} />
          <InfoItem label="Observador" value={player.observer || '—'} />
          <InfoItem label="Avaliação Obs." value={player.observerEval || '—'} />
          <InfoItem label="Decisão Obs." value={player.observerDecision || '—'} />
        </InfoGrid>
        {player.notes && (
          <div className="mt-3">
            <p className="text-sm font-medium text-muted-foreground">Observações</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{player.notes}</p>
          </div>
        )}
      </ProfileSection>

      {/* ───────────── Links Externos ───────────── */}
      <ProfileSection title="Links Externos">
        <div className="flex flex-wrap gap-2">
          {player.fpfLink && (
            <Button variant="outline" size="sm" asChild>
              <a href={player.fpfLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3 w-3" />
                FPF
              </a>
            </Button>
          )}
          {player.zerozeroLink && (
            <Button variant="outline" size="sm" asChild>
              <a href={player.zerozeroLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3 w-3" />
                ZeroZero
              </a>
            </Button>
          )}
          {!player.fpfLink && !player.zerozeroLink && (
            <p className="text-sm text-muted-foreground">Sem links externos.</p>
          )}
        </div>

        {/* Club verification */}
        {player.fpfCurrentClub && player.fpfCurrentClub !== player.club && (
          <div className="mt-3 rounded-md border border-orange-200 bg-orange-50 p-3">
            <p className="text-sm font-medium text-orange-800">
              Atenção: clube FPF diferente do registado
            </p>
            <p className="text-sm text-orange-700">
              BD: {player.club} → FPF: {player.fpfCurrentClub}
            </p>
          </div>
        )}
      </ProfileSection>

      {/* ───────────── Relatórios de Observação ───────────── */}
      {player.reportLabels.length > 0 && (
        <ProfileSection title="Relatórios de Observação">
          <div className="space-y-2">
            {player.reportLabels.map((label, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">{label}</span>
                {player.reportLinks[i] && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={player.reportLinks[i]} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ProfileSection>
      )}

      {/* ───────────── Recrutamento ───────────── */}
      <ProfileSection title="Recrutamento">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Estado:</span>
            <StatusBadge status={player.recruitmentStatus} />
          </div>
          {player.recruitmentNotes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notas</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{player.recruitmentNotes}</p>
            </div>
          )}
          {player.isShadowSquad && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Plantel Sombra:</span>
              <span className="text-sm font-medium">
                {player.shadowPosition ?? 'Sem posição'}
              </span>
            </div>
          )}
          {player.isRealSquad && (
            <span className="inline-flex items-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
              Plantel Real
            </span>
          )}
        </div>
      </ProfileSection>
    </div>
  );
}

/* ───────────── Helper Components ───────────── */

function ProfileSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3">
            <CardTitle className="text-base">{title}</CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {children}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-PT');
  } catch {
    return dateStr;
  }
}
