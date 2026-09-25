# B12 — Mobile app / PWA

## Goal
Installable app on phones and desktops ($0: no native app).

## Build
- `src/app/manifest.ts`: name "Ticket System", short_name "Tickets", start_url
  `/dashboard`, scope `/`, display standalone, background/theme `#08090a` (dark app
  default) , icons 192/512 PNG (`any`) + 512 maskable, plus the SVG.
- `public/icons/*`: PNGs rendered from `src/app/icon.svg` with the sharp binary Next
  already ships (one-off script, not a dependency); maskable variant has the glyph in
  the 80% safe zone on a full-bleed brand background; 180px apple-touch-icon.
- Root layout: `viewport.themeColor` light/dark from the tokens, `appleWebApp`
  (capable, title, black-translucent status bar), apple-touch icon; mounts
  `<RegisterServiceWorker/>` and `<OfflineBanner/>`.
- `src/components/pwa/register-sw.tsx`: registers `/sw.js` in production, or in dev
  with `?sw=1`; `?sw=0` unregisters (debug escape hatch).

## Edge cases
Browsers without service workers → no-op. Registration errors are logged, never
surfaced. The manifest route is static (no auth).
