// Browser side of the interface language (src/lib/i18n.ts): the server already
// chose it (src/lib/server/i18n.ts) and wrote it to <html lang>, so the browser
// reads it from there. getLocale is overwritten rather than resolved through
// strategies because Paraglide's client resolution saves its first result in
// the PARAGLIDE_LOCALE cookie, which would pin "Automatic" to today's browser
// language. The cookie is written only for an explicit choice
// (language-form.svelte).
import { overwriteGetLocale } from '@/lib/paraglide/runtime';
import { BASE_LOCALE, toAppLocale } from '@/lib/i18n-locales';

overwriteGetLocale(() => toAppLocale(document.documentElement.lang) ?? BASE_LOCALE);
