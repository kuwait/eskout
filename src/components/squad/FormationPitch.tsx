// src/components/squad/FormationPitch.tsx
// Pure presentational pitch — renders FormationSlots in desktop/mobile layouts
// Extracted from FormationView so it can be reused in single-squad and multi-squad views
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/components/squad/MultiShadowSquadView.tsx, src/components/squad/FormationSlot.tsx

'use client';

import { FormationSlot } from '@/components/squad/FormationSlot';
import type { Player, PositionCode } from '@/lib/types';
import type { SquadSignStatus } from '@/actions/squads';
import type { SpecialSquadSection } from '@/lib/constants';

/* ───────────── Formation Groups (mirrored from FormationView) ───────────── */

/** Visual slot IDs — DC split into two visual groups. AD/AE/MD/ME/SA excluded */
export type FormationSlotId = Exclude<PositionCode, 'AD' | 'AE' | 'MD' | 'ME' | 'SA'> | 'DC_E' | 'DC_D';

const DESKTOP_GROUPS: FormationSlotId[][] = [
  ['GR'],
  ['DE', 'DC_E', 'DC_D', 'DD'],
  ['MDC', 'MC'],
  ['EE', 'MOC', 'ED'],
  ['PL'],
];

const MOBILE_GROUPS: FormationSlotId[][] = [
  ['GR'],
  ['DC_D', 'DC_E'],
  ['DD', 'DE'],
  ['MDC', 'MC'],
  ['MOC'],
  ['ED', 'EE'],
  ['PL'],
];

const SLOT_CONFIG: Record<FormationSlotId, { position: PositionCode; label: string }> = {
  GR: { position: 'GR', label: 'GR' },
  DD: { position: 'DD', label: 'DD' },
  DE: { position: 'DE', label: 'DE' },
  DC: { position: 'DC', label: 'DC' },
  DC_E: { position: 'DC', label: 'DC (E)' },
  DC_D: { position: 'DC', label: 'DC (D)' },
  MDC: { position: 'MDC', label: 'MDC' },
  MC: { position: 'MC', label: 'MC' },
  MOC: { position: 'MOC', label: 'MOC' },
  ED: { position: 'ED', label: 'ED' },
  EE: { position: 'EE', label: 'EE' },
  PL: { position: 'PL', label: 'PL' },
};

/* ───────────── Props ───────────── */

interface FormationPitchProps {
  /** Players grouped by slot ID (already with virtual move applied if mid-drag) */
  byPosition: Record<string, Player[]>;
  squadType: 'real' | 'shadow';
  isDesktop: boolean;
  onAdd: (slot: string) => void;
  onRemovePlayer: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
  onToggleDoubt?: (playerId: number, isDoubt: boolean) => void;
  onSetSignStatus?: (playerId: number, status: SquadSignStatus) => void;
  onTogglePreseason?: (playerId: number, isPreseason: boolean) => void;
  onMoveToSection?: (playerId: number, section: SpecialSquadSection) => void;
  /** Scope drag/drop IDs so multiple pitches can coexist in one DndContext */
  idScope?: number;
}

/* ───────────── Component ───────────── */

export function FormationPitch({
  byPosition,
  squadType,
  isDesktop,
  onAdd,
  onRemovePlayer,
  onPlayerClick,
  onToggleDoubt,
  onSetSignStatus,
  onTogglePreseason,
  onMoveToSection,
  idScope,
}: FormationPitchProps) {
  const renderSlot = (slotId: FormationSlotId) => {
    const config = SLOT_CONFIG[slotId];
    return (
      <FormationSlot
        key={slotId}
        position={config.position}
        slotId={slotId}
        positionLabel={config.label !== config.position ? config.label : undefined}
        players={byPosition[slotId] ?? []}
        squadType={squadType}
        onAdd={() => onAdd(slotId)}
        onRemovePlayer={onRemovePlayer}
        onPlayerClick={onPlayerClick}
        onToggleDoubt={onToggleDoubt}
        onSetSignStatus={onSetSignStatus}
        onTogglePreseason={onTogglePreseason}
        onMoveToSection={onMoveToSection}
        idScope={idScope}
      />
    );
  };

  if (isDesktop) {
    return (
      <div className="relative overflow-x-auto rounded-xl">
        <div className="relative bg-green-700 p-4" style={{ width: 'max(100%, 720px)', minHeight: 520 }}>
          <PitchMarkingsHorizontal />
          <div className="relative flex h-full items-stretch justify-between gap-2 px-2 py-2" style={{ minHeight: 488 }}>
            {DESKTOP_GROUPS.map((group, i) => {
              const isMidfield = i === 2;
              const isAttacking = i === 3;
              return (
                <div
                  key={i}
                  className={`flex flex-1 flex-col items-center ${
                    isMidfield
                      ? 'justify-center gap-[6rem]'
                      : isAttacking
                        ? 'justify-center gap-[3rem]'
                        : group.length === 1
                          ? 'justify-center'
                          : 'justify-between'
                  } py-2`}
                >
                  {group.map(renderSlot)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-green-700 p-3">
      <PitchMarkingsVertical />
      <div className="relative flex flex-col gap-1 py-2">
        {MOBILE_GROUPS.map((group, i) => {
          const isWideRow = group.length === 2 && (
            (group.includes('DE') && group.includes('DD')) ||
            (group.includes('EE') && group.includes('ED'))
          );
          return (
            <div
              key={i}
              className={`flex items-start ${isWideRow ? 'justify-between px-[5px]' : 'justify-center gap-1'}`}
            >
              {group.map(renderSlot)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Pitch Markings: Horizontal (desktop) ───────────── */

function PitchMarkingsHorizontal() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-3 rounded border-2 border-white/25" />
      <div className="absolute inset-y-3 left-1/2 w-0 border-l-2 border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />

      <div className="absolute left-3 top-1/2 h-40 w-14 -translate-y-1/2 rounded-r border-2 border-l-0 border-white/25" />
      <div className="absolute left-3 top-1/2 h-24 w-7 -translate-y-1/2 rounded-r border-2 border-l-0 border-white/25" />
      <div className="absolute left-1 top-1/2 h-16 w-2 -translate-y-1/2 rounded-r border-2 border-l-0 border-white/30" />
      <div className="absolute left-[68px] top-1/2 h-16 w-8 -translate-y-1/2 rounded-r-full border-2 border-l-0 border-white/20" />

      <div className="absolute right-3 top-1/2 h-40 w-14 -translate-y-1/2 rounded-l border-2 border-r-0 border-white/25" />
      <div className="absolute right-3 top-1/2 h-24 w-7 -translate-y-1/2 rounded-l border-2 border-r-0 border-white/25" />
      <div className="absolute right-1 top-1/2 h-16 w-2 -translate-y-1/2 rounded-l border-2 border-r-0 border-white/30" />
      <div className="absolute right-[68px] top-1/2 h-16 w-8 -translate-y-1/2 rounded-l-full border-2 border-r-0 border-white/20" />

      <div className="absolute left-3 top-3 h-4 w-4 rounded-br-full border-b-2 border-r-2 border-white/20" />
      <div className="absolute bottom-3 left-3 h-4 w-4 rounded-tr-full border-r-2 border-t-2 border-white/20" />
      <div className="absolute right-3 top-3 h-4 w-4 rounded-bl-full border-b-2 border-l-2 border-white/20" />
      <div className="absolute bottom-3 right-3 h-4 w-4 rounded-tl-full border-l-2 border-t-2 border-white/20" />
    </div>
  );
}

/* ───────────── Pitch Markings: Vertical (mobile) ───────────── */

function PitchMarkingsVertical() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-3 rounded border-2 border-white/25" />
      <div className="absolute inset-x-3 top-1/2 h-0 border-t-2 border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />

      <div className="absolute left-1/2 top-3 h-10 w-36 -translate-x-1/2 rounded-b border-2 border-t-0 border-white/25" />
      <div className="absolute left-1/2 top-3 h-5 w-20 -translate-x-1/2 rounded-b border-2 border-t-0 border-white/25" />
      <div className="absolute left-1/2 top-1 h-2 w-14 -translate-x-1/2 rounded-b border-2 border-t-0 border-white/30" />
      <div className="absolute left-1/2 top-[52px] h-6 w-14 -translate-x-1/2 rounded-b-full border-2 border-t-0 border-white/20" />

      <div className="absolute bottom-3 left-1/2 h-10 w-36 -translate-x-1/2 rounded-t border-2 border-b-0 border-white/25" />
      <div className="absolute bottom-3 left-1/2 h-5 w-20 -translate-x-1/2 rounded-t border-2 border-b-0 border-white/25" />
      <div className="absolute bottom-1 left-1/2 h-2 w-14 -translate-x-1/2 rounded-t border-2 border-b-0 border-white/30" />
      <div className="absolute bottom-[52px] left-1/2 h-6 w-14 -translate-x-1/2 rounded-t-full border-2 border-b-0 border-white/20" />

      <div className="absolute left-3 top-3 h-4 w-4 rounded-br-full border-b-2 border-r-2 border-white/20" />
      <div className="absolute right-3 top-3 h-4 w-4 rounded-bl-full border-b-2 border-l-2 border-white/20" />
      <div className="absolute bottom-3 left-3 h-4 w-4 rounded-tr-full border-r-2 border-t-2 border-white/20" />
      <div className="absolute bottom-3 right-3 h-4 w-4 rounded-tl-full border-l-2 border-t-2 border-white/20" />
    </div>
  );
}
