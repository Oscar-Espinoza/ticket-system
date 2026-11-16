<script lang="ts">
  import { m } from '@/lib/i18n';
  import WifiOffIcon from '@lucide/svelte/icons/wifi-off';

  import RetryButton from './retry-button.svelte';
</script>

<svelte:head>
  <title>{m.auth_offline_title()}</title>
</svelte:head>

<main class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
  <span aria-hidden="true" class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
    <WifiOffIcon class="size-4" />
  </span>
  <h1 class="text-lg font-medium">{m.auth_offline_heading()}</h1>
  <p class="max-w-sm text-sm text-muted-foreground">
    {m.auth_offline_body()}
  </p>
  <RetryButton />
</main>
