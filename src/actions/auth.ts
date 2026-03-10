// src/actions/auth.ts
// Server Actions for authentication (login, logout)
// Uses Supabase Auth with email + password strategy
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/app/login/page.tsx

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { setActiveClub } from '@/lib/supabase/club-context';
import { loginSchema } from '@/lib/validators';
import type { ActionResponse } from '@/lib/types';

export async function login(formData: FormData): Promise<ActionResponse> {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { success: false, error: 'Email ou palavra-passe incorretos' };
  }

  // Pre-set club cookie so middleware doesn't need an extra redirect loop
  // If user has exactly one club, set it immediately; multi-club users go to picker
  if (authData.user) {
    const { data: memberships } = await supabase
      .from('club_memberships')
      .select('club_id')
      .eq('user_id', authData.user.id);

    if (memberships?.length === 1) {
      await setActiveClub(memberships[0].club_id);
    }
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function resetPassword(email: string): Promise<ActionResponse> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Email inválido' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  if (error) {
    return { success: false, error: 'Erro ao enviar email de recuperação' };
  }

  return { success: true };
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}
