// src/app/mais/page.tsx
// "More" menu page for mobile — links to Position view, Import, Export, Admin sections
// Provides navigation to pages not in the bottom tab bar
// RELEVANT FILES: src/components/layout/MobileNav.tsx, src/app/posicoes/page.tsx, src/app/layout.tsx

import Link from 'next/link';
import { CalendarDays, Upload, Download, UserCog } from 'lucide-react';

const ITEMS = [
  { href: '/calendario', label: 'Calendário', icon: CalendarDays, description: 'Agenda de eventos e tarefas' },
  { href: '/importar', label: 'Importar', icon: Upload, description: 'Importar ficheiro Excel' },
  { href: '/exportar', label: 'Exportar', icon: Download, description: 'Exportar PDF / Excel' },
  { href: '/admin/utilizadores', label: 'Utilizadores', icon: UserCog, description: 'Gestão de utilizadores' },
];

export default function MaisPage() {
  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Mais</h1>
      <div className="space-y-2">
        {ITEMS.map((item) => {
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
