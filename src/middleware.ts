// src/middleware.ts
// Next.js middleware for session refresh, club context, and route protection
// Refreshes Supabase auth, enforces club selection, role-based access
// RELEVANT FILES: src/lib/supabase/club-context.ts, src/lib/supabase/server.ts, src/app/login/page.tsx

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const CLUB_COOKIE = 'eskout-club-id';

const PUBLIC_ROUTES = ['/login', '/auth/confirm', '/definir-password', '/demo', '/feedback'];
// Routes that require admin role — editors and scouts are redirected
const ADMIN_ONLY_ROUTES = ['/admin'];
// Scouts can ONLY access these routes — everything else is blocked
const SCOUT_ALLOWED_ROUTES = ['/meus-relatorios', '/submeter', '/mais', '/preferencias', '/jogadores/novo', '/meus-jogadores'];
// Recruiters are blocked from these routes (scouting data, export, admin)
const RECRUITER_BLOCKED_ROUTES = ['/exportar', '/meus-relatorios', '/submeter', '/admin', '/alertas'];
// Club picker — no club required
const NO_CLUB_ROUTES = ['/escolher-clube', '/preferencias'];
// Superadmin panel — only superadmins
const SUPERADMIN_ROUTES = ['/master'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — IMPORTANT: do not remove this
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Let social media crawlers through to read OG meta tags (WhatsApp, Telegram, Facebook, Twitter, etc.)
  const ua = request.headers.get('user-agent') ?? '';
  const isCrawler = /WhatsApp|facebookexternalhit|Twitterbot|TelegramBot|LinkedInBot|Slackbot|Discordbot/i.test(ua);

  // Redirect unauthenticated users to login (except bots — they need OG tags)
  if (!user && !isPublicRoute && !isCrawler) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Skip further checks for public routes
  if (!user || isPublicRoute) return supabaseResponse;

  // ── Superadmin routes ──
  const isSuperadminRoute = SUPERADMIN_ROUTES.some((route) => pathname.startsWith(route));
  if (isSuperadminRoute) {
    // /master/competicoes is accessible to superadmins AND users with can_view_competitions
    const isCompetitionsRoute = pathname.startsWith('/master/competicoes');
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_superadmin, can_view_competitions')
      .eq('id', user.id)
      .single();

    const hasSuperadminAccess = profile?.is_superadmin;
    const hasCompetitionAccess = isCompetitionsRoute && profile?.can_view_competitions;

    if (!hasSuperadminAccess && !hasCompetitionAccess) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // ── Club context check ──
  const isNoClubRoute = NO_CLUB_ROUTES.some((route) => pathname.startsWith(route));
  const clubId = request.cookies.get(CLUB_COOKIE)?.value;

  if (!clubId && !isNoClubRoute) {
    // No club selected — check if user has clubs
    const { data: memberships } = await supabase
      .from('club_memberships')
      .select('club_id')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      // No clubs at all — show "no club" message (club picker handles this)
      const url = request.nextUrl.clone();
      url.pathname = '/escolher-clube';
      return NextResponse.redirect(url);
    }

    if (memberships.length === 1) {
      // Auto-select single club
      const url = request.nextUrl.clone();
      supabaseResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.set(CLUB_COOKIE, memberships[0].club_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
      return supabaseResponse;
    }

    // Multiple clubs — redirect to picker
    const url = request.nextUrl.clone();
    url.pathname = '/escolher-clube';
    return NextResponse.redirect(url);
  }

  // ── Role-based route protection (club-scoped) ──
  const isAdminRoute = ADMIN_ONLY_ROUTES.some((route) => pathname.startsWith(route));
  // Scouts can also view individual player profiles (e.g., /jogadores/123)
  const isPlayerProfile = /^\/jogadores\/\d+$/.test(pathname);
  const isScoutAllowed = isPlayerProfile || SCOUT_ALLOWED_ROUTES.some((route) => pathname.startsWith(route));

  if (clubId && (isAdminRoute || !isScoutAllowed)) {
    // Fetch club role from membership
    const { data: membership } = await supabase
      .from('club_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    let role = membership?.role;

    // Superadmin role impersonation — check override cookie
    if (role) {
      const roleOverride = request.cookies.get('eskout-role-override')?.value;
      if (roleOverride) {
        // Verify user is superadmin before applying override
        const { data: saProfile } = await supabase
          .from('profiles')
          .select('is_superadmin')
          .eq('id', user.id)
          .single();
        if (saProfile?.is_superadmin) role = roleOverride;
      }
    }

    // If no membership for this club, clear cookie and redirect
    if (!role) {
      const url = request.nextUrl.clone();
      url.pathname = '/escolher-clube';
      supabaseResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.delete(CLUB_COOKIE);
      return supabaseResponse;
    }

    // Admin-only pages — editors can access /admin/pendentes
    const isEditorAllowedAdmin = role === 'editor' && pathname.startsWith('/admin/pendentes');
    if (isAdminRoute && role !== 'admin' && !isEditorAllowedAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // Scout — redirect to /meus-relatorios if accessing any non-allowed route
    if (role === 'scout' && !isScoutAllowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/meus-relatorios';
      return NextResponse.redirect(url);
    }

    // Recruiter — block scouting, export routes (player list now allowed)
    if (role === 'recruiter') {
      const isRecruiterBlocked = RECRUITER_BLOCKED_ROUTES.some((route) => pathname.startsWith(route));
      if (isRecruiterBlocked) {
        const url = request.nextUrl.clone();
        url.pathname = '/campo/real';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files, api routes, and _next
    '/((?!_next/static|_next/image|api/|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
