// src/components/settings/ThemePicker.tsx
// Theme selector cards — lets any user pick their preferred app theme
// Stores choice in localStorage via ThemeProvider context
// RELEVANT FILES: src/lib/theme.tsx, src/app/preferencias/page.tsx, src/app/globals.css

'use client';

import { Check } from 'lucide-react';
import { useTheme, THEMES } from '@/lib/theme';
import { cn } from '@/lib/utils';

/* Font label per theme (matches globals.css font overrides) */
const FONT_LABELS: Record<string, string> = {
  eskout: 'Inter',
  ocean: 'DM Sans',
  forest: 'Inter',
  sunset: 'DM Sans',
  berry: 'Space Grotesk',
  sand: 'DM Sans',
  rose: 'DM Sans',
  slate: 'Space Grotesk',
  midnight: 'Space Grotesk',
  carbon: 'Inter',
};

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
      {THEMES.map((t) => {
        const isActive = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              'relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all',
              isActive
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-border hover:border-muted-foreground/30',
            )}
          >
            {/* Color preview bar */}
            <div className="flex w-full gap-1 rounded-md overflow-hidden h-6">
              {t.colors.map((color, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <div>
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{t.description}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{FONT_LABELS[t.id]}</p>
            </div>

            {/* Active check */}
            {isActive && (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check className="h-3 w-3 text-primary-foreground" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
