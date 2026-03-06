// src/app/admin/utilizadores/page.tsx
// Admin-only user management page — list users, invite new, change roles, delete
// Protected by middleware (admin role check) and server-side role verification
// RELEVANT FILES: src/actions/users.ts, src/middleware.ts, src/components/layout/Sidebar.tsx

import { listUsers } from '@/actions/users';
import { UserManagement } from './UserManagement';

export default async function UtilizadoresPage() {
  const { users, error } = await listUsers();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Utilizadores</h1>
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <UserManagement initialUsers={users} />
    </div>
  );
}
