// The interface languages, without importing the generated Paraglide runtime,
// so server-only modules that load outside Vite (auth config, scripts) can use
// them. Must match project.inlang/settings.json (src/tests/i18n-guard.test.ts
// checks it).

export const LOCALES = ['en', 'es'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const BASE_LOCALE: AppLocale = 'en';

/** The language's own name, shown in the language picker. */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: 'English',
  es: 'Español',
};

export function toAppLocale(value: unknown): AppLocale | null {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
    ? (value as AppLocale)
    : null;
}
