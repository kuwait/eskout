// src/app/mais/page.tsx
// "More" menu page for mobile — links to Import, Export, Admin sections + theme picker
// Provides navigation to pages not in the bottom tab bar. Role-filtered items.
// RELEVANT FILES: src/components/layout/MobileNav.tsx, src/lib/supabase/queries.ts, src/lib/theme.tsx

import Link from 'next/link';
import { Download, UserCog, Settings, LogOut, Palette } from 'lucide-react';
import { getCurrentUserRole } from '@/lib/supabase/queries';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';

const ITEMS = [
  { href: '/preferencias', label: 'Preferências', icon: Palette, description: 'Tema e personalização', adminOnly: false, scoutHidden: false },
  { href: '/definicoes', label: 'Definições', icon: Settings, description: 'Atualizar dados externos (FPF, ZeroZero)', adminOnly: false, scoutHidden: true },
  { href: '/exportar', label: 'Exportar', icon: Download, description: 'Exportar Excel / PDF / JSON', adminOnly: true, scoutHidden: true },
  { href: '/admin/utilizadores', label: 'Utilizadores', icon: UserCog, description: 'Gestão de utilizadores', adminOnly: true, scoutHidden: true },
];

export default async function MaisPage() {
  const role = await getCurrentUserRole();
  const isAdmin = role === 'admin';
  const isScout = role === 'scout';

  const visibleItems = isScout
    ? ITEMS.filter((item) => !item.scoutHidden)
    : isAdmin
      ? ITEMS
      : ITEMS.filter((item) => !item.adminOnly);

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

        {/* Logout — visible to all */}
        <form action={logout}>
          <Button variant="outline" className="w-full justify-start gap-3 mt-4" type="submit">
            <LogOut className="h-5 w-5 text-neutral-600" />
            Sair
          </Button>
        </form>
      </div>
    </div>
  );
}
