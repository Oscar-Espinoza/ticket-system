'use client';

// M1 wires next-themes with defaultTheme="system" (behavior-neutral: users keep
// their OS theme). The sidebar toggle and the flip to dark-default are owned by
// M3 (docs/mimo-refactor/M3-interaction-layer.md) — do not add UI here.

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
    >
      {children}
    </NextThemesProvider>
  );
}
