// src/app/mais/page.tsx
// "More" menu page for mobile — links to Import, Export, Admin sections
// Provides navigation to pages not in the bottom tab bar. Admin items hidden for non-admins.
// RELEVANT FILES: src/components/layout/MobileNav.tsx, src/lib/supabase/queries.ts, src/app/layout.tsx

import Link from 'next/link';
import { Upload, Download, UserCog, Settings } from 'lucide-react';
import { getCurrentUserRole } from '@/lib/supabase/queries';

const ITEMS = [
  { href: '/definicoes', label: 'Definições', icon: Settings, description: 'Atualizar dados externos (FPF, ZeroZero)', adminOnly: false },
  { href: '/importar', label: 'Importar', icon: Upload, description: 'Importar ficheiro Excel', adminOnly: true },
  { href: '/exportar', label: 'Exportar', icon: Download, description: 'Exportar PDF / Excel', adminOnly: true },
  { href: '/admin/utilizadores', label: 'Utilizadores', icon: UserCog, description: 'Gestão de utilizadores', adminOnly: true },
];

export default async function MaisPage() {
  const role = await getCurrentUserRole();
  const isAdmin = role === 'admin';
  const visibleItems = isAdmin ? ITEMS : ITEMS.filter((item) => !item.adminOnly);

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Mais</h1>
      <div className="space-y-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg border bg-white p-4 transition-colors hover:bg-neutral-50"
            >
              <Icon className="h-5 w-5 text-neutral-600" />
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
