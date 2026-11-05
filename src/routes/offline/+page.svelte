<!-- Port of src/app/offline/page.tsx. -->
<script lang="ts">
  import WifiOffIcon from '@lucide/svelte/icons/wifi-off';

  import RetryButton from './retry-button.svelte';
</script>

<svelte:head>
  <title>Offline · Ticket System</title>
</svelte:head>

<main class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
  <span aria-hidden="true" class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
    <WifiOffIcon class="size-4" />
  </span>
  <h1 class="text-lg font-medium">You're offline</h1>
  <p class="max-w-sm text-sm text-muted-foreground">
    This page hasn't been saved for offline use. Pages you opened recently still work read-only — reconnect to see
    the latest and make changes.
  </p>
  <RetryButton />
</main>
