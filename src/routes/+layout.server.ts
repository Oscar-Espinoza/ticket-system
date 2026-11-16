// Root layout data: the interface language the server chose for this request
// (src/lib/server/i18n.ts). Sign-in, sign-up, two-factor and sign-out navigate
// with refreshAll, so this reruns when the account (and its language) changes;
// +layout.svelte reloads the page when it no longer matches <html lang>.
import { currentLocale } from '@/lib/i18n';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({ locale: currentLocale() });
