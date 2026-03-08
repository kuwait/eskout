// src/app/master/layout.tsx
// Layout for superadmin panel — sidebar navigation, no club context
// Protected by middleware (only is_superadmin = true can access)
// RELEVANT FILES: src/middleware.ts, src/app/master/page.tsx

import { MasterSidebar } from './MasterSidebar';

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <MasterSidebar />

      {/* Main content */}
      <main className="lg:ml-64 p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
