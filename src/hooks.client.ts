// Browser side of the interface language (src/lib/i18n.ts): the server already
// chose it (src/lib/server/i18n.ts) and wrote it to <html lang>, so the
// client's custom-user strategy reads it from there instead of re-detecting.
// Saving a new language goes through updateLanguage (profile action), not here.
import { defineCustomClientStrategy } from '@/lib/paraglide/runtime';
import { toAppLocale } from '@/lib/i18n-locales';

defineCustomClientStrategy('custom-user', {
  getLocale: () => toAppLocale(document.documentElement.lang) ?? undefined,
  setLocale: () => {},
});
