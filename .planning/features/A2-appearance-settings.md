# A2 — Appearance settings

## Goal
`/dashboard/settings/appearance`: theme Light / Dark / System (next-themes,
"System" follows the OS), and interface density Comfortable / Compact.

## Density
- Stored in `localStorage['density']` (try/catch), applied as
  `data-density="compact"` on `<html>`.
- Pre-paint: `AppShell` renders a tiny inline script that copies the stored
  value onto `<html>` while the HTML parses (no flash), plus a hoisted
  `<style>` hook: `html[data-density=compact] { font-size: 93.75% }`. Tailwind
  v4 sizes spacing and text in rem, so the whole app tightens by ~6% with one
  rule and no per-component work. Scoped to the dashboard (the shell).
- Other agents can target `[data-density=compact]` for finer tweaks.

## UX
Two radio card groups (RadioGroup), change applies instantly; no Save button.
Rendered after mount only (theme is unknown during SSR → avoids a checked-state
hydration mismatch).

## Files
`src/app/dashboard/settings/appearance/page.tsx`,
`src/components/settings/appearance-form.tsx`, `src/lib/density.ts`,
`src/components/app-shell/app-shell.tsx` (script + style hook).

## Edge cases
Storage blocked → density works for the session, just not remembered.
