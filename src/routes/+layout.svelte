<!--
  Root layout. The <html>/<body> classes, PWA and
  theme-color metas, icons, manifest and the density boot script live in
  src/app.html; Geist / Geist Mono come from src/app.css (@fontsource).
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import '../app.css';

  import { untrack, type Snippet } from 'svelte';

  import { Toaster } from '@/lib/components/ui/sonner';
  import { TooltipProvider } from '@/lib/components/ui/tooltip';
  import { markAppHydrated } from '@/lib/svelte/hydration';
  import ThemeProvider from '@/lib/svelte/theme-provider.svelte';
  import { switchLocale } from '@/lib/svelte/locale-switch';
  import { toAppLocale } from '@/lib/i18n-locales';
  // Lane L1 (PWA)
  import OfflineBanner from '@/lib/components/pwa/offline-banner.svelte';
  import RegisterServiceWorker from '@/lib/components/pwa/register-sw.svelte';

  let { children, data }: { children: Snippet; data: { locale: string } } = $props();

  // First hydration done: later client-side mounts read browser state directly.
  $effect(() => markAppHydrated());

  // The language on screen. When the server's locale for the page changes
  // without a document load (Settings › Language saved and refreshed the data,
  // or signing in to / out of an account with another language), switch in
  // place: <html lang> changes and the keyed subtree below renders again in the
  // new language (src/lib/svelte/locale-switch.ts).
  // Switches run one at a time and always aim at the latest locale the data
  // asked for, so a change that arrives while a cross-fade is in flight is
  // applied right after it, and a stale one is never applied.
  let shown = $state(untrack(() => data.locale));
  let requested = untrack(() => data.locale);
  let switching = false;
  async function reconcile() {
    if (switching) return;
    switching = true;
    try {
      while (requested !== shown) {
        const next = toAppLocale(requested);
        if (!next) break;
        await switchLocale(
          () => toAppLocale(requested) ?? next,
          (locale) => (shown = locale),
        );
      }
    } finally {
      switching = false;
    }
  }
  $effect(() => {
    requested = data.locale;
    void reconcile();
  });

  // Re-read when the language on screen changes (this layout isn't re-keyed).
  const description = $derived.by(() => {
    void shown;
    return m.auth_site_description();
  });
</script>

<svelte:head>
  <!-- Default title; pages set "<page> · Ticket System". -->
  <title>Ticket System</title> <!-- i18n-ignore -->
  <meta name="description" content={description} />
  <meta property="og:title" content="Ticket System" />
  <meta property="og:description" content={description} />
  <meta property="og:type" content="website" />
</svelte:head>

<ThemeProvider>
  <TooltipProvider>
    {#key shown}
      {@render children()}
      <OfflineBanner />
    {/key}
  </TooltipProvider>
  <!-- Single app-wide Toaster (the React app mounted it in TopbarChrome). -->
  <Toaster position="bottom-right" />
</ThemeProvider>

<RegisterServiceWorker />
