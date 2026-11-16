<!--
  Root layout. The <html>/<body> classes, PWA and
  theme-color metas, icons, manifest and the density boot script live in
  src/app.html; Geist / Geist Mono come from src/app.css (@fontsource).
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import '../app.css';

  import type { Snippet } from 'svelte';

  import { Toaster } from '@/lib/components/ui/sonner';
  import { TooltipProvider } from '@/lib/components/ui/tooltip';
  import { markAppHydrated } from '@/lib/svelte/hydration';
  import ThemeProvider from '@/lib/svelte/theme-provider.svelte';
  // Lane L1 (PWA)
  import OfflineBanner from '@/lib/components/pwa/offline-banner.svelte';
  import RegisterServiceWorker from '@/lib/components/pwa/register-sw.svelte';

  let { children, data }: { children: Snippet; data: { locale: string } } = $props();

  // First hydration done: later client-side mounts read browser state directly.
  $effect(() => markAppHydrated());

  // The interface language changed without a document load (signing in to an
  // account with another saved language, or signing out): everything already
  // rendered is in the old language and the browser's locale comes from
  // <html lang> (src/hooks.client.ts), so load the page again.
  $effect(() => {
    if (data.locale !== document.documentElement.lang) location.reload();
  });

  const description = $derived(m.auth_site_description());
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
  <TooltipProvider>{@render children()}</TooltipProvider>
  <!-- Single app-wide Toaster (the React app mounted it in TopbarChrome). -->
  <Toaster position="bottom-right" />
</ThemeProvider>

<RegisterServiceWorker />
<OfflineBanner />
