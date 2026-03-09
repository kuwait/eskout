// src/app/master/layout.tsx
// Layout for superadmin panel — sidebar navigation, no club context
// Protected by middleware (only is_superadmin = true can access)
// RELEVANT FILES: src/middleware.ts, src/app/master/page.tsx

import { MasterSidebar } from './MasterSidebar';

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <MasterSidebar />

      {/* Main content — no left margin on mobile (sidebar hidden, hamburger header used instead) */}
      <main className="p-4 md:p-8 lg:ml-64">
        {children}
      </main>
    </div>
  );
}
