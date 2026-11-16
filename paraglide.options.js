// Paraglide compiler options, shared by the Vite plugin (vite.config.ts) and
// scripts/i18n-compile.mjs (svelte-check and tests run without Vite's build).
// Locale order: the signed-in user's saved language (custom-user,
// src/lib/server/i18n.ts), the cookie a signed-out visitor's choice sets,
// Accept-Language, English. No URL strategy: URLs carry no language prefix.
/** @type {import('@inlang/paraglide-js').CompilerOptions} */
export const PARAGLIDE_OPTIONS = {
  project: './project.inlang',
  outdir: './src/lib/paraglide',
  strategy: /** @type {const} */ (['custom-user', 'cookie', 'preferredLanguage', 'baseLocale']),
  emitTsDeclarations: true,
};
