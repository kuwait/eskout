// src/components/squad/SquadExcelColumnDialog.tsx
// Dialog for customizing which columns appear in the squad Excel export + their order
// Persists the user's column selection in localStorage so the next export remembers it
// RELEVANT FILES: src/components/squad/SquadExportMenu.tsx, src/lib/utils/exportSquad.ts

'use client';

import { useCallback, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DIRECTOR_EXCEL_COLUMNS,
  type DirectorExcelColumnId,
} from '@/lib/utils/exportSquad';

/* ───────────── Types & Storage ───────────── */

interface ColumnItem {
  id: DirectorExcelColumnId;
  label: string;
  enabled: boolean;
}

interface StoredShape {
  v: 1;
  columns: { id: string; enabled: boolean }[];
}

const STORAGE_KEY = 'eskout-director-excel-columns';

function getDefaultItems(): ColumnItem[] {
  return DIRECTOR_EXCEL_COLUMNS.map((c) => ({
    id: c.id,
    label: c.label,
    enabled: c.defaultEnabled,
  }));
}

/**
 * Merge stored user preferences with the current registry.
 * Keeps known IDs in the user's chosen order, drops unknown IDs (e.g. columns
 * removed in a later release), appends any newly-added registry columns at the
 * end with their default enabled state.
 */
function mergeWithRegistry(stored: { id: string; enabled: boolean }[]): ColumnItem[] {
  const registry = new Map(DIRECTOR_EXCEL_COLUMNS.map((c) => [c.id as string, c]));
  const result: ColumnItem[] = [];
  const seen = new Set<string>();

  for (const s of stored) {
    const def = registry.get(s.id);
    if (def) {
      result.push({ id: def.id, label: def.label, enabled: !!s.enabled });
      seen.add(def.id);
    }
  }
  for (const def of DIRECTOR_EXCEL_COLUMNS) {
    if (!seen.has(def.id)) {
      result.push({ id: def.id, label: def.label, enabled: def.defaultEnabled });
    }
  }
  return result;
}

function loadStoredItems(): ColumnItem[] {
  if (typeof window === 'undefined') return getDefaultItems();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultItems();
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.v !== 1 || !Array.isArray(parsed.columns)) return getDefaultItems();
    return mergeWithRegistry(parsed.columns);
  } catch {
    return getDefaultItems();
  }
}

function persistItems(items: ColumnItem[]) {
  if (typeof window === 'undefined') return;
  const payload: StoredShape = {
    v: 1,
    columns: items.map((i) => ({ id: i.id, enabled: i.enabled })),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or disabled storage — silently ignore, export still works with in-memory state
  }
}

/* ───────────── Sortable row ───────────── */

function SortableRow({
  item,
  onToggle,
}: {
  item: ColumnItem;
  onToggle: (id: DirectorExcelColumnId, enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-neutral-200 bg-card px-2 py-2 dark:border-neutral-700"
    >
      <button
        type="button"
        className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
        aria-label={`Reordenar ${item.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        id={`col-${item.id}`}
        checked={item.enabled}
        onCheckedChange={(checked) => onToggle(item.id, checked === true)}
      />
      <label
        htmlFor={`col-${item.id}`}
        className="flex-1 cursor-pointer select-none text-sm"
      >
        {item.label}
      </label>
    </div>
  );
}

/* ───────────── Dialog body (mounted only while open) ───────────── */

/**
 * Inner content lives in its own component so it mounts/unmounts with `open`.
 * That way `useState(loadStoredItems)` runs every time the dialog opens, picking
 * up any changes from another tab — no useEffect-driven setState needed.
 */
function DialogBody({
  onExport,
  onClose,
}: {
  onExport: (columnIds: DirectorExcelColumnId[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ColumnItem[]>(loadStoredItems);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIdx = prev.findIndex((i) => i.id === active.id);
      const newIdx = prev.findIndex((i) => i.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  const handleToggle = useCallback((id: DirectorExcelColumnId, enabled: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, enabled } : i)));
  }, []);

  const handleReset = () => setItems(getDefaultItems());

  const handleExport = () => {
    const enabledIds = items.filter((i) => i.enabled).map((i) => i.id);
    if (enabledIds.length === 0) return; // Button is disabled in this state
    persistItems(items);
    onExport(enabledIds);
    onClose();
  };

  const enabledCount = items.filter((i) => i.enabled).length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Personalizar Excel</DialogTitle>
        <DialogDescription>
          Escolhe que colunas incluir e arrasta para reordenar. A tua escolha é lembrada para a próxima vez.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto py-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableRow key={item.id} item={item} onToggle={handleToggle} />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Repor predefinido
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleExport} disabled={enabledCount === 0}>
            Exportar ({enabledCount})
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/* ───────────── Dialog ───────────── */

interface SquadExcelColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the ordered list of enabled column IDs when the user confirms */
  onExport: (columnIds: DirectorExcelColumnId[]) => void;
}

export function SquadExcelColumnDialog({ open, onOpenChange, onExport }: SquadExcelColumnDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <DialogBody onExport={onExport} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
