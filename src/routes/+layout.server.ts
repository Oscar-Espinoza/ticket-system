// Root layout data: the interface language the server chose for this request
// (src/lib/server/i18n.ts). Sign-in, sign-up, two-factor and sign-out navigate
// with refreshAll, so this reruns when the account (and its language) changes;
// +layout.svelte switches the page in place when it no longer matches.
import { currentLocale } from '@/lib/i18n';
import type { LayoutServerLoad } from './$types';

// `userId` lets the language controller drop a pending save when the account
// changes (src/lib/svelte/language-controller.svelte.ts).
export const load: LayoutServerLoad = ({ locals }) => ({
  locale: currentLocale(),
  userId: locals.user?.id ?? null,
});
