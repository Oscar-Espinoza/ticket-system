'use client';

// M1 wired next-themes with defaultTheme="system" (behavior-neutral); M3 owns
// the flip this comment deferred — dark is now the default for fresh visits
// (docs/mimo-refactor/M3-interaction-layer.md scope 4). The light/dark toggle
// lives in the sidebar avatar menu (user-menu.tsx); persistence is
// next-themes' localStorage key. Do not add UI here.

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
    >
      {children}
    </NextThemesProvider>
  );
}
