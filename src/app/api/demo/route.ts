// src/app/api/demo/route.ts
// Auto-login API route for demo mode — signs in as demo user and redirects to app
// Creates a real Supabase session with demo user credentials
// RELEVANT FILES: src/app/demo/page.tsx, src/middleware.ts, src/lib/supabase/club-context.ts

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const DEMO_EMAIL = 'demo@eskout.com';
const DEMO_PASSWORD = 'demo-eskout-2026';
const CLUB_COOKIE = 'eskout-club-id';

export async function GET() {
  const cookieStore = await cookies();

  const supabaseResponse = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Sign in as demo user
  const { data, error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  if (error || !data.user) {
    // Demo user not configured — redirect to login with error
    return NextResponse.redirect(
      new URL('/login?error=demo', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
    );
  }

  // Find the demo club membership
  const { data: memberships } = await supabase
    .from('club_memberships')
    .select('club_id, clubs(is_demo)')
    .eq('user_id', data.user.id);

  // Prefer the demo club; fall back to first membership
  const demoMembership = memberships?.find(
    (m) => (m.clubs as unknown as { is_demo: boolean })?.is_demo
  );
  const clubId = demoMembership?.club_id ?? memberships?.[0]?.club_id;

  if (clubId) {
    supabaseResponse.cookies.set(CLUB_COOKIE, clubId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 1 day (shorter for demo)
    });
  }

  return supabaseResponse;
}
