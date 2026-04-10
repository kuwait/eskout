// src/lib/__tests__/middleware-routing.test.ts
// Unit tests for middleware routing logic — claims-based role checks, redirects, route protection
// Tests the pure routing decisions without Next.js request/response infrastructure
// RELEVANT FILES: src/middleware.ts, src/components/layout/__tests__/nav-items.test.ts

/* ───────────── Route Constants (mirrored from middleware.ts) ───────────── */

const PUBLIC_ROUTES = ['/login', '/auth/confirm', '/definir-password', '/demo', '/feedback'];
const ADMIN_ONLY_ROUTES = ['/admin'];
const SCOUT_ALLOWED_ROUTES = ['/', '/avaliacoes', '/submeter', '/mais', '/preferencias', '/jogadores/novo', '/meus-jogos', '/observacoes', '/listas'];
const RECRUITER_BLOCKED_ROUTES = ['/exportar', '/avaliacoes', '/submeter', '/admin', '/alertas'];
const NO_CLUB_ROUTES = ['/escolher-clube', '/preferencias'];
const SUPERADMIN_ROUTES = ['/master'];

/* ───────────── Types ───────────── */

interface UserClaims {
  clubRoles: Record<string, string>;
  isSuperadmin: boolean;
  canViewCompetitions: boolean;
}

interface RoutingInput {
  pathname: string;
  user: UserClaims | null;
  clubCookieId: string | null;
  roleOverrideCookie: string | null;
}

type RoutingResult =
  | { action: 'pass' }
  | { action: 'redirect'; to: string }
  | { action: 'redirect_set_club'; to: string; clubId: string }
  | { action: 'redirect_clear_club'; to: string };

/* ───────────── Pure Routing Function (mirrors middleware logic) ───────────── */

function resolveRoute(input: RoutingInput): RoutingResult {
  const { pathname, user, clubCookieId, roleOverrideCookie } = input;

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // Unauthenticated → login
  if (!user && !isPublicRoute) {
    return { action: 'redirect', to: '/login' };
  }

  // Authenticated on login → home
  if (user && pathname === '/login') {
    return { action: 'redirect', to: '/' };
  }

  // Public route or no user → pass
  if (!user || isPublicRoute) return { action: 'pass' };

  const { clubRoles, isSuperadmin, canViewCompetitions } = user;

  // ── Superadmin routes ──
  const isSuperadminRoute = SUPERADMIN_ROUTES.some((route) => pathname.startsWith(route));
  if (isSuperadminRoute) {
    const isCompetitionsRoute = pathname.startsWith('/master/competicoes');
    if (!isSuperadmin && !(isCompetitionsRoute && canViewCompetitions)) {
      return { action: 'redirect', to: '/' };
    }
    return { action: 'pass' };
  }

  // ── Club context check ──
  const isNoClubRoute = NO_CLUB_ROUTES.some((route) => pathname.startsWith(route));

  if (!clubCookieId && !isNoClubRoute) {
    const userClubIds = Object.keys(clubRoles);

    if (userClubIds.length === 0) {
      return { action: 'redirect', to: '/escolher-clube' };
    }

    if (userClubIds.length === 1) {
      return { action: 'redirect_set_club', to: pathname, clubId: userClubIds[0] };
    }

    return { action: 'redirect', to: '/escolher-clube' };
  }

  // ── Role-based route protection ──
  const isAdminRoute = ADMIN_ONLY_ROUTES.some((route) => pathname.startsWith(route));
  const isPlayerProfile = /^\/jogadores\/\d+$/.test(pathname);
  const isScoutAllowed = isPlayerProfile || SCOUT_ALLOWED_ROUTES.some((route) =>
    route === '/' ? pathname === '/' : pathname.startsWith(route),
  );

  if (clubCookieId && (isAdminRoute || !isScoutAllowed)) {
    let role = clubRoles[clubCookieId];

    // Superadmin role impersonation
    if (role && isSuperadmin && roleOverrideCookie) {
      role = roleOverrideCookie;
    }

    // No membership for this club → clear cookie
    if (!role) {
      return { action: 'redirect_clear_club', to: '/escolher-clube' };
    }

    // Admin-only pages — editors can access /admin/pendentes
    const isEditorAllowedAdmin = role === 'editor' && pathname.startsWith('/admin/pendentes');
    if (isAdminRoute && role !== 'admin' && !isEditorAllowedAdmin) {
      return { action: 'redirect', to: '/' };
    }

    // Scout — redirect to /avaliacoes
    if (role === 'scout' && !isScoutAllowed) {
      return { action: 'redirect', to: '/avaliacoes' };
    }

    // Recruiter — block certain routes
    if (role === 'recruiter') {
      const isRecruiterBlocked = RECRUITER_BLOCKED_ROUTES.some((route) => pathname.startsWith(route));
      if (isRecruiterBlocked) {
        return { action: 'redirect', to: '/campo/real' };
      }
    }
  }

  return { action: 'pass' };
}

/* ───────────── Test Fixtures ───────────── */

const BOAVISTA_ID = 'b2a1af88-c9c7-4127-ab66-7059747e5776';
const DEMO_CLUB_ID = '285519f9-b096-4b31-aae9-ccea141931bf';

const makeUser = (overrides?: Partial<UserClaims>): UserClaims => ({
  clubRoles: { [BOAVISTA_ID]: 'admin' },
  isSuperadmin: false,
  canViewCompetitions: false,
  ...overrides,
});

const adminUser = makeUser({ clubRoles: { [BOAVISTA_ID]: 'admin' }, isSuperadmin: true });
const editorUser = makeUser({ clubRoles: { [BOAVISTA_ID]: 'editor' } });
const scoutUser = makeUser({ clubRoles: { [BOAVISTA_ID]: 'scout' } });
const recruiterUser = makeUser({ clubRoles: { [BOAVISTA_ID]: 'recruiter' } });
const multiClubUser = makeUser({ clubRoles: { [BOAVISTA_ID]: 'admin', [DEMO_CLUB_ID]: 'editor' } });

/* ───────────── Unauthenticated ───────────── */

describe('middleware routing — unauthenticated', () => {
  it('redirects to /login on protected route', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: null, clubCookieId: null, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/login' });
  });

  it('allows /login', () => {
    const result = resolveRoute({ pathname: '/login', user: null, clubCookieId: null, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows /feedback/abc-token', () => {
    const result = resolveRoute({ pathname: '/feedback/abc-123', user: null, clubCookieId: null, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows /demo', () => {
    const result = resolveRoute({ pathname: '/demo', user: null, clubCookieId: null, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });
});

/* ───────────── Authenticated — redirect away from login ───────────── */

describe('middleware routing — authenticated on login', () => {
  it('redirects to / if already logged in', () => {
    const result = resolveRoute({ pathname: '/login', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/' });
  });
});

/* ───────────── Superadmin routes ───────────── */

describe('middleware routing — superadmin routes', () => {
  it('allows superadmin to access /master', () => {
    const result = resolveRoute({ pathname: '/master', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows superadmin to access /master/online', () => {
    const result = resolveRoute({ pathname: '/master/online', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('blocks non-superadmin from /master', () => {
    const result = resolveRoute({ pathname: '/master', user: editorUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/' });
  });

  it('allows can_view_competitions user to /master/competicoes', () => {
    const user = makeUser({ canViewCompetitions: true });
    const result = resolveRoute({ pathname: '/master/competicoes', user, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('blocks can_view_competitions user from /master/online', () => {
    const user = makeUser({ canViewCompetitions: true });
    const result = resolveRoute({ pathname: '/master/online', user, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/' });
  });
});

/* ───────────── Club context ───────────── */

describe('middleware routing — club context', () => {
  it('auto-selects single club when no cookie', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: editorUser, clubCookieId: null, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect_set_club', to: '/jogadores', clubId: BOAVISTA_ID });
  });

  it('redirects to club picker when multiple clubs and no cookie', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: multiClubUser, clubCookieId: null, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/escolher-clube' });
  });

  it('redirects to club picker when no clubs at all', () => {
    const user = makeUser({ clubRoles: {} });
    const result = resolveRoute({ pathname: '/jogadores', user, clubCookieId: null, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/escolher-clube' });
  });

  it('allows /preferencias without club cookie', () => {
    const user = makeUser({ clubRoles: {} });
    const result = resolveRoute({ pathname: '/preferencias', user, clubCookieId: null, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('clears cookie if club_id not in claims', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: editorUser, clubCookieId: 'non-existent-club', roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect_clear_club', to: '/escolher-clube' });
  });
});

/* ───────────── Admin role ───────────── */

describe('middleware routing — admin', () => {
  it('allows admin to /admin/utilizadores', () => {
    const result = resolveRoute({ pathname: '/admin/utilizadores', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows admin to /jogadores', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows admin to /pipeline', () => {
    const result = resolveRoute({ pathname: '/pipeline', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });
});

/* ───────────── Editor role ───────────── */

describe('middleware routing — editor', () => {
  it('blocks editor from /admin/utilizadores', () => {
    const result = resolveRoute({ pathname: '/admin/utilizadores', user: editorUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/' });
  });

  it('allows editor to /admin/pendentes', () => {
    const result = resolveRoute({ pathname: '/admin/pendentes', user: editorUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows editor to /jogadores', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: editorUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows editor to /pipeline', () => {
    const result = resolveRoute({ pathname: '/pipeline', user: editorUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });
});

/* ───────────── Scout role ───────────── */

describe('middleware routing — scout', () => {
  it('allows scout to /', () => {
    const result = resolveRoute({ pathname: '/', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows scout to /avaliacoes', () => {
    const result = resolveRoute({ pathname: '/avaliacoes', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows scout to /submeter', () => {
    const result = resolveRoute({ pathname: '/submeter', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows scout to /jogadores/novo', () => {
    const result = resolveRoute({ pathname: '/jogadores/novo', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows scout to view player profile /jogadores/123', () => {
    const result = resolveRoute({ pathname: '/jogadores/123', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows scout to /listas', () => {
    const result = resolveRoute({ pathname: '/listas', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('blocks scout from /jogadores (player list)', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/avaliacoes' });
  });

  it('blocks scout from /pipeline', () => {
    const result = resolveRoute({ pathname: '/pipeline', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/avaliacoes' });
  });

  it('blocks scout from /campo/real', () => {
    const result = resolveRoute({ pathname: '/campo/real', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/avaliacoes' });
  });

  it('blocks scout from /admin (admin check runs first → redirects to /)', () => {
    const result = resolveRoute({ pathname: '/admin/utilizadores', user: scoutUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/' });
  });
});

/* ───────────── Recruiter role ───────────── */

describe('middleware routing — recruiter', () => {
  it('allows recruiter to /jogadores', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: recruiterUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows recruiter to /pipeline', () => {
    const result = resolveRoute({ pathname: '/pipeline', user: recruiterUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows recruiter to /campo/real', () => {
    const result = resolveRoute({ pathname: '/campo/real', user: recruiterUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('blocks recruiter from /exportar', () => {
    const result = resolveRoute({ pathname: '/exportar', user: recruiterUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/campo/real' });
  });

  it('allows recruiter to /avaliacoes (scout-allowed route, recruiter block is via nav items)', () => {
    const result = resolveRoute({ pathname: '/avaliacoes', user: recruiterUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'pass' });
  });

  it('blocks recruiter from /admin (admin check runs first → redirects to /)', () => {
    const result = resolveRoute({ pathname: '/admin/utilizadores', user: recruiterUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/' });
  });

  it('blocks recruiter from /alertas', () => {
    const result = resolveRoute({ pathname: '/alertas', user: recruiterUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: null });
    expect(result).toEqual({ action: 'redirect', to: '/campo/real' });
  });
});

/* ───────────── Superadmin role impersonation ───────────── */

describe('middleware routing — role impersonation', () => {
  it('superadmin with scout override is blocked from /jogadores', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: 'scout' });
    expect(result).toEqual({ action: 'redirect', to: '/avaliacoes' });
  });

  it('superadmin with recruiter override is blocked from /exportar', () => {
    const result = resolveRoute({ pathname: '/exportar', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: 'recruiter' });
    expect(result).toEqual({ action: 'redirect', to: '/campo/real' });
  });

  it('non-superadmin with override cookie is ignored', () => {
    const result = resolveRoute({ pathname: '/jogadores', user: editorUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: 'scout' });
    // Editor on /jogadores — passes because editor is allowed (override ignored)
    expect(result).toEqual({ action: 'pass' });
  });

  it('superadmin with admin override can access /admin', () => {
    const result = resolveRoute({ pathname: '/admin/utilizadores', user: adminUser, clubCookieId: BOAVISTA_ID, roleOverrideCookie: 'admin' });
    expect(result).toEqual({ action: 'pass' });
  });
});
