<!--
  Errors outside the dashboard (and unknown URLs): "404 | This page could not be
  found." and, for other errors, a short "Something went wrong" state with a way
  back.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { page } from '$app/state';

  $effect(() => {
    if (page.status !== 404) console.error(page.error);
  });
</script>

<svelte:head>
  {#if page.status === 404}
    <title>{m.auth_error_404_title()}</title>
  {:else}
    <title>{m.auth_error_title()}</title>
  {/if}
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center text-center">
  {#if page.status === 404}
    <div class="flex items-center">
      <h1 class="mr-5 border-r border-foreground/30 pr-6 text-2xl leading-[49px] font-medium">404</h1>
      <h2 class="text-sm leading-[49px] font-normal">{m.auth_error_not_found()}</h2>
    </div>
  {:else}
    <h1 class="text-lg font-medium">{m.auth_error_heading()}</h1>
    <p class="mt-1 text-sm text-muted-foreground">{m.auth_error_body()}</p>
    <a href="/dashboard" class="mt-4 text-sm underline underline-offset-4">{m.auth_error_back()}</a>
  {/if}
</div>
