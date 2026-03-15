// src/components/admin/ContactPurposeList.tsx
// Admin client component for managing contact purpose options
// Drag-to-reorder, inline edit, add new, delete with usage check
// RELEVANT FILES: src/actions/contact-purposes.ts, src/app/admin/objetivos-contacto/page.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition } from 'react';
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
import { Archive, GripVertical, Pencil, Plus, RotateCcw, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createContactPurpose,
  updateContactPurpose,
  reorderContactPurposes,
  deleteContactPurpose,
  restoreContactPurpose,
  getContactPurposeUsageCount,
} from '@/actions/contact-purposes';
import type { ContactPurpose } from '@/lib/types';

/* ───────────── Constants ───────────── */

const LABEL_MAX_LENGTH = 50;

/* ───────────── Sortable Item ───────────── */

function SortableItem({
  purpose,
  onEdit,
  onDelete,
  onRestore,
}: {
  purpose: ContactPurpose;
  onEdit: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: purpose.id });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(purpose.label);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleSave() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === purpose.label) {
      setEditing(false);
      setEditValue(purpose.label);
      return;
    }
    onEdit(purpose.id, trimmed);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-white px-3 py-2 ${
        purpose.isArchived ? 'border-dashed border-neutral-300 bg-neutral-50 opacity-60' : ''
      }`}
    >
      {/* Drag handle */}
      {!purpose.isArchived && (
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      {/* Label — inline edit or display */}
      {editing ? (
        <div className="flex flex-1 items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value.slice(0, LABEL_MAX_LENGTH))}
            className="h-8 flex-1 text-sm"
            maxLength={LABEL_MAX_LENGTH}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') { setEditing(false); setEditValue(purpose.label); }
            }}
          />
          <button type="button" onClick={handleSave} className="rounded p-1 text-green-600 hover:bg-green-50">
            <Check className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setEditing(false); setEditValue(purpose.label); }} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <span className={`flex-1 text-sm ${purpose.isArchived ? 'line-through' : ''}`}>
          {purpose.label}
        </span>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex shrink-0 items-center gap-1">
          {purpose.isArchived ? (
            <button
              type="button"
              onClick={() => onRestore(purpose.id)}
              className="rounded p-1 text-blue-500 hover:bg-blue-50"
              title="Restaurar"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-foreground"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(purpose.id)}
                className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Main List Component ───────────── */

export function ContactPurposeList({ initialPurposes }: { initialPurposes: ContactPurpose[] }) {
  const [purposes, setPurposes] = useState(initialPurposes);
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string; usageCount: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Active (non-archived) purposes for sorting
  const activePurposes = purposes.filter((p) => !p.isArchived);
  const archivedPurposes = purposes.filter((p) => p.isArchived);

  /* ───────────── Handlers ───────────── */

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activePurposes.findIndex((p) => p.id === active.id);
    const newIndex = activePurposes.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(activePurposes, oldIndex, newIndex);
    // Update full list preserving archived items at the end
    setPurposes([...reordered, ...archivedPurposes]);

    startTransition(async () => {
      const result = await reorderContactPurposes(reordered.map((p) => p.id));
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao reordenar');
        setPurposes(initialPurposes);
      }
    });
  }

  function handleEdit(id: string, label: string) {
    setPurposes((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)));

    startTransition(async () => {
      const result = await updateContactPurpose(id, label);
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao atualizar');
        setPurposes(initialPurposes);
      } else {
        toast.success('Objetivo atualizado');
      }
    });
  }

  async function handleDeleteClick(id: string) {
    const purpose = purposes.find((p) => p.id === id);
    if (!purpose) return;

    // Check usage count before showing dialog
    const count = await getContactPurposeUsageCount(id);
    setDeleteTarget({ id, label: purpose.label, usageCount: count });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;

    startTransition(async () => {
      const result = await deleteContactPurpose(id);
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao eliminar');
      } else {
        // If archived (had usage), update local state
        setPurposes((prev) =>
          prev.map((p) => (p.id === id ? { ...p, isArchived: true } : p))
            .filter((p) => deleteTarget.usageCount > 0 ? true : p.id !== id)
        );
        toast.success(deleteTarget.usageCount > 0 ? 'Objetivo arquivado' : 'Objetivo eliminado');
      }
      setDeleteTarget(null);
    });
  }

  function handleRestore(id: string) {
    startTransition(async () => {
      const result = await restoreContactPurpose(id);
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao restaurar');
      } else {
        setPurposes((prev) => prev.map((p) => (p.id === id ? { ...p, isArchived: false } : p)));
        toast.success('Objetivo restaurado');
      }
    });
  }

  function handleAddNew() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const result = await createContactPurpose(trimmed);
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao criar');
      } else if (result.data) {
        setPurposes((prev) => [...prev.filter((p) => !p.isArchived), result.data!, ...prev.filter((p) => p.isArchived)]);
        setNewLabel('');
        setAddingNew(false);
        toast.success('Objetivo criado');
      }
    });
  }

  return (
    <div className="max-w-lg space-y-3">
      {/* Sortable list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={activePurposes.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {activePurposes.map((purpose) => (
              <SortableItem
                key={purpose.id}
                purpose={purpose}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
                onRestore={handleRestore}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {activePurposes.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Sem objetivos configurados.
        </p>
      )}

      {/* Add new */}
      {addingNew ? (
        <div className="flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value.slice(0, LABEL_MAX_LENGTH))}
            placeholder="Novo objetivo…"
            className="h-9 flex-1 text-sm"
            maxLength={LABEL_MAX_LENGTH}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddNew();
              if (e.key === 'Escape') { setAddingNew(false); setNewLabel(''); }
            }}
            disabled={isPending}
          />
          <Button size="sm" onClick={handleAddNew} disabled={isPending || !newLabel.trim()}>
            Adicionar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddingNew(false); setNewLabel(''); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAddingNew(true)} className="w-full">
          <Plus className="mr-1 h-4 w-4" />
          Adicionar objetivo
        </Button>
      )}

      {/* Archived section */}
      {archivedPurposes.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Archive className="h-3.5 w-3.5" />
            Arquivados ({archivedPurposes.length})
          </div>
          <div className="space-y-1.5">
            {archivedPurposes.map((purpose) => (
              <SortableItem
                key={purpose.id}
                purpose={purpose}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
                onRestore={handleRestore}
              />
            ))}
          </div>
        </div>
      )}

      {/* Note about "Outro" */}
      <p className="text-xs text-muted-foreground">
        A opção &quot;Outro&quot; com campo de texto livre aparece sempre no final da lista, não é editável.
      </p>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar objetivo</DialogTitle>
          </DialogHeader>

          <p className="text-sm">
            Tem a certeza que quer eliminar <span className="font-medium">&quot;{deleteTarget?.label}&quot;</span>?
          </p>

          {deleteTarget && deleteTarget.usageCount > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Este objetivo é usado em <span className="font-bold">{deleteTarget.usageCount}</span> entrada{deleteTarget.usageCount !== 1 ? 's' : ''} do histórico.
              Será arquivado em vez de eliminado — desaparece da lista mas os dados históricos são mantidos.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteConfirm} disabled={isPending}>
              {deleteTarget && deleteTarget.usageCount > 0 ? 'Arquivar' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
