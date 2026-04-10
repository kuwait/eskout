// src/actions/contact-purposes.ts
// Server Actions for managing contact purpose options per club
// CRUD for the contact_purposes table — admin-only mutations, all roles can read
// RELEVANT FILES: src/lib/types/index.ts, src/lib/supabase/club-context.ts, supabase/migrations/068_contact_purposes.sql

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import type { ActionResponse, ContactPurpose, ContactPurposeRow } from '@/lib/types';

/* ───────────── Mapper ───────────── */

function mapRow(row: ContactPurposeRow): ContactPurpose {
  return {
    id: row.id,
    clubId: row.club_id,
    label: row.label,
    sortOrder: row.sort_order,
    isArchived: row.is_archived,
  };
}

/* ───────────── Read ───────────── */

/** Fetch active (non-archived) contact purposes for the current club, ordered by sort_order */
export async function getContactPurposes(): Promise<ContactPurpose[]> {
  const { clubId } = await getAuthContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contact_purposes')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_archived', false)
    .order('sort_order');

  if (error) {
    console.error('[getContactPurposes] Failed:', error);
    return [];
  }

  return (data as ContactPurposeRow[]).map(mapRow);
}

/** Fetch ALL contact purposes (including archived) for admin management */
export async function getAllContactPurposes(): Promise<ContactPurpose[]> {
  const { clubId, role } = await getAuthContext();
  if (role !== 'admin') return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contact_purposes')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order');

  if (error) {
    console.error('[getAllContactPurposes] Failed:', error);
    return [];
  }

  return (data as ContactPurposeRow[]).map(mapRow);
}

/* ───────────── Create ───────────── */

/** Add a new contact purpose option */
export async function createContactPurpose(label: string): Promise<ActionResponse<ContactPurpose>> {
  const trimmed = label.trim();
  if (!trimmed) return { success: false, error: 'O nome é obrigatório' };
  if (trimmed.length > 50) return { success: false, error: 'Máximo de 50 caracteres' };

  const { clubId, role } = await getAuthContext();
  if (role !== 'admin') return { success: false, error: 'Apenas administradores podem gerir objetivos' };

  const supabase = await createClient();

  // Get max sort_order for this club
  const { data: maxRow } = await supabase
    .from('contact_purposes')
    .select('sort_order')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from('contact_purposes')
    .insert({ club_id: clubId, label: trimmed, sort_order: nextOrder })
    .select()
    .single();

  if (error) return { success: false, error: `Erro ao criar: ${error.message}` };

  revalidatePath('/admin/objetivos-contacto');
  revalidatePath('/pipeline');

  return { success: true, data: mapRow(data as ContactPurposeRow) };
}

/* ───────────── Update ───────────── */

/** Rename a contact purpose */
export async function updateContactPurpose(id: string, label: string): Promise<ActionResponse> {
  const trimmed = label.trim();
  if (!trimmed) return { success: false, error: 'O nome é obrigatório' };
  if (trimmed.length > 50) return { success: false, error: 'Máximo de 50 caracteres' };

  const { clubId, role } = await getAuthContext();
  if (role !== 'admin') return { success: false, error: 'Apenas administradores podem gerir objetivos' };

  const supabase = await createClient();

  const { error } = await supabase
    .from('contact_purposes')
    .update({ label: trimmed })
    .eq('id', id)
    .eq('club_id', clubId);

  if (error) return { success: false, error: `Erro ao atualizar: ${error.message}` };

  revalidatePath('/admin/objetivos-contacto');
  revalidatePath('/pipeline');

  return { success: true };
}

/* ───────────── Reorder ───────────── */

/** Bulk update sort_order for all contact purposes */
export async function reorderContactPurposes(orderedIds: string[]): Promise<ActionResponse> {
  const { clubId, role } = await getAuthContext();
  if (role !== 'admin') return { success: false, error: 'Apenas administradores podem gerir objetivos' };

  const supabase = await createClient();

  // Sequential updates — small N (typically <20 items)
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('contact_purposes')
      .update({ sort_order: i + 1 })
      .eq('id', orderedIds[i])
      .eq('club_id', clubId);

    if (error) return { success: false, error: `Erro ao reordenar: ${error.message}` };
  }

  revalidatePath('/admin/objetivos-contacto');
  revalidatePath('/pipeline');

  return { success: true };
}

/* ───────────── Delete / Archive ───────────── */

/** Count how many status_history entries reference this contact purpose */
export async function getContactPurposeUsageCount(id: string): Promise<number> {
  const { clubId } = await getAuthContext();
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('status_history')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('contact_purpose_id', id);

  if (error) {
    console.error('[getContactPurposeUsageCount] Failed:', error);
    return 0;
  }

  return count ?? 0;
}

/** Delete a contact purpose (only if unused) or archive it (if used) */
export async function deleteContactPurpose(id: string): Promise<ActionResponse> {
  const { clubId, role } = await getAuthContext();
  if (role !== 'admin') return { success: false, error: 'Apenas administradores podem gerir objetivos' };

  const usageCount = await getContactPurposeUsageCount(id);
  const supabase = await createClient();

  if (usageCount > 0) {
    // Archive instead of delete — keeps historical data intact
    const { error } = await supabase
      .from('contact_purposes')
      .update({ is_archived: true })
      .eq('id', id)
      .eq('club_id', clubId);

    if (error) return { success: false, error: `Erro ao arquivar: ${error.message}` };
  } else {
    // Safe to hard delete — no references
    const { error } = await supabase
      .from('contact_purposes')
      .delete()
      .eq('id', id)
      .eq('club_id', clubId);

    if (error) return { success: false, error: `Erro ao eliminar: ${error.message}` };
  }

  revalidatePath('/admin/objetivos-contacto');
  revalidatePath('/pipeline');

  return { success: true };
}

/** Reassign all status_history entries from one contact purpose to another, then delete the old one */
export async function reassignContactPurpose(fromId: string, toId: string): Promise<ActionResponse> {
  const { clubId, role } = await getAuthContext();
  if (role !== 'admin') return { success: false, error: 'Apenas administradores podem gerir objetivos' };

  const supabase = await createClient();

  // Reassign all references
  const { error: reassignError } = await supabase
    .from('status_history')
    .update({ contact_purpose_id: toId })
    .eq('club_id', clubId)
    .eq('contact_purpose_id', fromId);

  if (reassignError) return { success: false, error: `Erro ao reatribuir: ${reassignError.message}` };

  // Now safe to hard delete
  const { error: deleteError } = await supabase
    .from('contact_purposes')
    .delete()
    .eq('id', fromId)
    .eq('club_id', clubId);

  if (deleteError) return { success: false, error: `Erro ao eliminar: ${deleteError.message}` };

  revalidatePath('/admin/objetivos-contacto');
  revalidatePath('/pipeline');

  return { success: true };
}

/** Restore an archived contact purpose */
export async function restoreContactPurpose(id: string): Promise<ActionResponse> {
  const { clubId, role } = await getAuthContext();
  if (role !== 'admin') return { success: false, error: 'Apenas administradores podem gerir objetivos' };

  const supabase = await createClient();

  const { error } = await supabase
    .from('contact_purposes')
    .update({ is_archived: false })
    .eq('id', id)
    .eq('club_id', clubId);

  if (error) return { success: false, error: `Erro ao restaurar: ${error.message}` };

  revalidatePath('/admin/objetivos-contacto');
  revalidatePath('/pipeline');

  return { success: true };
}
