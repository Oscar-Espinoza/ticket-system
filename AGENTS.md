# This is NOT the SvelteKit you know

SvelteKit 3 (with Svelte 5 runes) has breaking changes from SvelteKit 2 and
from most training data: config lives in `vite.config.ts` (no
`svelte.config.js`), `$lib` is `#lib` (this repo uses the `@/` alias),
`$app/stores` is gone (`$app/state`), `invalidateAll` is `refreshAll`, remote
functions are still experimental, and `redirect()` is not allowed in commands.
Read `docs/migration/SVELTEKIT_REFERENCE.md` (its "Verification" section wins)
and `docs/migration/PLAN.md` (repo conventions) before writing code.
