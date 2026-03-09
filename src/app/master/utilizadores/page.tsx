// src/app/master/utilizadores/page.tsx
// Superadmin global users page — lists all users across all clubs
// Shows email, name, auth status, club memberships, and allows deletion
// RELEVANT FILES: src/app/master/MasterSidebar.tsx, src/app/master/utilizadores/UsersClient.tsx

import { createServiceClient } from '@/lib/supabase/server';
import { UsersClient } from './UsersClient';

export default async function MasterUsersPage() {
  const service = await createServiceClient();

  // Fetch all auth users
  const { data: authData } = await service.auth.admin.listUsers();
  const authUsers = authData?.users ?? [];

  // Fetch all profiles
  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name, is_superadmin');

  // Fetch test club IDs to exclude test-only users
  const { data: testClubs } = await service
    .from('clubs')
    .select('id')
    .eq('is_test', true);
  const testClubIds = new Set((testClubs ?? []).map((c) => c.id));

  // Fetch all memberships with club info (exclude test clubs)
  const { data: memberships } = await service
    .from('club_memberships')
    .select('user_id, role, club_id, clubs(name, is_test)');

  // Build a map: userId → profile
  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  // Build a map: userId → club memberships (only real clubs)
  const membershipMap = new Map<string, { clubName: string; role: string }[]>();
  // Track which users have at least one real club
  const usersWithRealClub = new Set<string>();
  for (const m of memberships ?? []) {
    const club = m.clubs as unknown as { name: string; is_test: boolean } | null;
    if (testClubIds.has(m.club_id)) continue; // Skip test club memberships
    const list = membershipMap.get(m.user_id) ?? [];
    list.push({ clubName: club?.name ?? '—', role: m.role });
    membershipMap.set(m.user_id, list);
    usersWithRealClub.add(m.user_id);
  }

  // Combine into a single list — exclude users who only belong to test clubs
  const users = authUsers
    .filter((u) => {
      const profile = profileMap.get(u.id);
      // Keep superadmins (they're real users) and users with real club memberships
      return profile?.is_superadmin || usersWithRealClub.has(u.id);
    })
    .map((u) => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? '—',
        fullName: profile?.full_name ?? '—',
        isSuperadmin: profile?.is_superadmin ?? false,
        confirmed: !!u.email_confirmed_at,
        lastSignIn: u.last_sign_in_at ?? null,
        createdAt: u.created_at,
        clubs: membershipMap.get(u.id) ?? [],
      };
    });

  return <UsersClient users={users} />;
}
