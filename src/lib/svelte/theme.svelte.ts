// Theme (light / dark / system) on top of mode-watcher.
//
// Setup: the root layout renders <ThemeProvider> (src/lib/svelte/theme-provider.svelte),
// i.e. <ModeWatcher>: `class` attribute (.dark on <html>), default 'dark',
// system preference followed, storage key 'theme' (raw-string format kept,
// so saved choices carry over).
//
// Use:
//   const theme = useTheme();
//   theme.theme          'light' | 'dark' | 'system' — the stored choice
//   theme.resolvedTheme  'light' | 'dark' — what is shown (undefined during SSR)
//   theme.systemTheme    'light' | 'dark' — the OS preference (undefined during SSR)
//   theme.setTheme(t)    persist a choice ('system' follows the OS again)
// All fields are reactive getters: read them off the object, don't destructure.

import { mode, resetMode, setMode, systemPrefersMode, userPrefersMode } from 'mode-watcher';

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEMES: ThemeChoice[] = ['light', 'dark', 'system'];

/** ModeWatcher props for the app's theme setup. */
export const THEME_WATCHER_OPTIONS = {
  defaultMode: 'dark',
  modeStorageKey: 'theme',
  darkClassNames: ['dark'],
  lightClassNames: [],
  track: true,
  disableTransitions: false,
} as const;

const isChoice = (value: unknown): value is ThemeChoice =>
  value === 'light' || value === 'dark' || value === 'system';

export function setTheme(next: ThemeChoice | string) {
  if (!isChoice(next)) return;
  // mode-watcher issue #144: setMode('system') misbehaves; resetMode() is the 'system' path.
  if (next === 'system') resetMode();
  else setMode(next);
}

const themeState = {
  get theme(): ThemeChoice {
    return userPrefersMode.current;
  },
  get resolvedTheme(): 'light' | 'dark' | undefined {
    return mode.current;
  },
  get systemTheme(): 'light' | 'dark' | undefined {
    return systemPrefersMode.current;
  },
  themes: THEMES,
  setTheme,
};

export type ThemeState = typeof themeState;

/** A reactive object (module-wide; safe to call anywhere). */
export function useTheme(): ThemeState {
  return themeState;
}
