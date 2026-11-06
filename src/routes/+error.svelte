<!--
  Errors outside the dashboard (and unknown URLs): "404 | This page could not be
  found." and, for other errors, a short "Something went wrong" state with a way
  back.
-->
<script lang="ts">
  import { page } from '$app/state';

  $effect(() => {
    if (page.status !== 404) console.error(page.error);
  });
</script>

<svelte:head>
  {#if page.status === 404}
    <title>404: This page could not be found.</title>
  {:else}
    <title>Something went wrong · Ticket System</title>
  {/if}
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center text-center">
  {#if page.status === 404}
    <div class="flex items-center">
      <h1 class="mr-5 border-r border-foreground/30 pr-6 text-2xl leading-[49px] font-medium">404</h1>
      <h2 class="text-sm leading-[49px] font-normal">This page could not be found.</h2>
    </div>
  {:else}
    <h1 class="text-lg font-medium">Something went wrong</h1>
    <p class="mt-1 text-sm text-muted-foreground">This page failed to load. Try again, or come back in a moment.</p>
    <a href="/dashboard" class="mt-4 text-sm underline underline-offset-4">Back to the dashboard</a>
  {/if}
</div>
