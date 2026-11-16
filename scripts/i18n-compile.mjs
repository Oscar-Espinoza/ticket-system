// Compiles messages/*.json to src/lib/paraglide (gitignored) without Vite, for
// `npm run check` and `npm run prepare`. The dev server and builds do the same
// through the Vite plugin.
import { compile } from '@inlang/paraglide-js';
import { PARAGLIDE_OPTIONS } from '../paraglide.options.js';

await compile(PARAGLIDE_OPTIONS);
