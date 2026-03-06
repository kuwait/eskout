// src/app/auth/confirm/route.ts
// Auth callback route — exchanges email token (invite, magic link, recovery) for a session
// Supabase redirects here after the user clicks an email link
// RELEVANT FILES: src/middleware.ts, src/app/definir-password/page.tsx, src/actions/auth.ts

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const redirectTo = request.nextUrl.clone();

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'invite' | 'email' | 'recovery',
      token_hash,
    });

    if (!error) {
      // Invite or recovery → redirect to set password page
      if (type === 'invite' || type === 'recovery') {
        redirectTo.pathname = '/definir-password';
        redirectTo.searchParams.delete('token_hash');
        redirectTo.searchParams.delete('type');
        return NextResponse.redirect(redirectTo);
      }

      // Other types (email confirmation) → redirect to home
      redirectTo.pathname = '/';
      redirectTo.searchParams.delete('token_hash');
      redirectTo.searchParams.delete('type');
      return NextResponse.redirect(redirectTo);
    }
  }

  // Error or missing params → redirect to login with error
  redirectTo.pathname = '/login';
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');
  return NextResponse.redirect(redirectTo);
}
