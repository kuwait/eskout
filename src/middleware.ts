// src/middleware.ts
// Next.js middleware for session refresh and route protection
// Refreshes Supabase auth session on every request, redirects unauthenticated users to /login
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/supabase/client.ts, src/app/login/page.tsx

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/auth/confirm', '/definir-password'];
// Routes that require admin role — editors and scouts are redirected
const ADMIN_ONLY_ROUTES = ['/admin'];
// Scouts can ONLY access these routes — everything else is blocked
const SCOUT_ALLOWED_ROUTES = ['/meus-relatorios', '/submeter', '/mais'];

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

  // Redirect unauthenticated users to login
  if (!user && !isPublicRoute) {
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

  // Role-based route protection — fetch role once if needed
  const isAdminRoute = ADMIN_ONLY_ROUTES.some((route) => pathname.startsWith(route));
  const isScoutAllowed = SCOUT_ALLOWED_ROUTES.some((route) => pathname.startsWith(route));

  if (user && (isAdminRoute || !isScoutAllowed)) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = data?.role;

    // Admin-only pages
    if (isAdminRoute && role !== 'admin') {
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
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files, api routes, and _next
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
