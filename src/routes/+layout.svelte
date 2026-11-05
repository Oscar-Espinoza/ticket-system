<!--
  Root layout (port of src/app/layout.tsx). The <html>/<body> classes, PWA and
  theme-color metas, icons, manifest and the density boot script live in
  src/app.html; Geist / Geist Mono come from src/app.css (@fontsource).
-->
<script lang="ts">
  import '../app.css';

  import type { Snippet } from 'svelte';

  import { Toaster } from '@/lib/components/ui/sonner';
  import { TooltipProvider } from '@/lib/components/ui/tooltip';
  import { markAppHydrated } from '@/lib/svelte/hydration';
  import ThemeProvider from '@/lib/svelte/theme-provider.svelte';
  // Lane L1 (PWA)
  import OfflineBanner from '@/lib/components/pwa/offline-banner.svelte';
  import RegisterServiceWorker from '@/lib/components/pwa/register-sw.svelte';

  let { children }: { children: Snippet } = $props();

  // First hydration done: later client-side mounts read browser state directly.
  $effect(() => markAppHydrated());

  const description = 'A Linear-style ticket tracker whose status stays in sync with GitHub work.';
</script>

<svelte:head>
  <!-- Default title; pages set "<page> · Ticket System". -->
  <title>Ticket System</title>
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

<!-- ===== Lane L1 (PWA): <RegisterServiceWorker /> and <OfflineBanner />,
     after the app, as src/app/layout.tsx did. ===== -->
<RegisterServiceWorker />
<OfflineBanner />
