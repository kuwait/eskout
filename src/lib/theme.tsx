// src/lib/theme.tsx
// Theme context provider — stores preference in localStorage, applies data-theme to <html>
// All users can pick a theme; default is 'eskout' (black & white)
// RELEVANT FILES: src/app/globals.css, src/app/layout.tsx, src/components/settings/ThemePicker.tsx

'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme =
  | 'eskout' | 'ocean' | 'forest' | 'sunset' | 'berry'
  | 'sand' | 'rose' | 'slate' | 'midnight' | 'carbon';

export const THEMES: { id: Theme; label: string; description: string; colors: [string, string, string] }[] = [
  { id: 'eskout', label: 'Eskout', description: 'Clássico preto e branco', colors: ['#ffffff', '#1a1a1a', '#f5f5f5'] },
  { id: 'ocean', label: 'Ocean', description: 'Azul profissional', colors: ['#f0f5ff', '#2563eb', '#ffffff'] },
  { id: 'forest', label: 'Forest', description: 'Verde relvado', colors: ['#f0faf4', '#16a34a', '#ffffff'] },
  { id: 'sunset', label: 'Sunset', description: 'Tons quentes laranja', colors: ['#fffaf5', '#ea580c', '#ffffff'] },
  { id: 'berry', label: 'Berry', description: 'Roxo elegante', colors: ['#f8f5ff', '#7c3aed', '#ffffff'] },
  { id: 'sand', label: 'Sand', description: 'Neutro terroso', colors: ['#faf8f5', '#a16207', '#ffffff'] },
  { id: 'rose', label: 'Rose', description: 'Rosa suave', colors: ['#fff5f6', '#e11d48', '#ffffff'] },
  { id: 'slate', label: 'Slate', description: 'Cinza moderno', colors: ['#f1f5f9', '#334155', '#ffffff'] },
  { id: 'midnight', label: 'Midnight', description: 'Escuro azulado', colors: ['#0f172a', '#3b82f6', '#1e293b'] },
  { id: 'carbon', label: 'Carbon', description: 'Escuro neutro', colors: ['#171717', '#a3a3a3', '#262626'] },
];

const STORAGE_KEY = 'eskout-theme';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: 'eskout', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('eskout');

  // Read saved theme on mount — cannot use lazy initializer because
  // localStorage is unavailable during SSR (ThemeProvider renders on server first)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved && THEMES.some((t) => t.id === saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: must read localStorage in effect
      setThemeState(saved);
      if (saved !== 'eskout') {
        document.documentElement.setAttribute('data-theme', saved);
      }
    }
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    if (t === 'eskout') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
