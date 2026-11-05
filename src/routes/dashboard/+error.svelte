<!--
  Errors in dashboard pages (port of src/app/dashboard/error.tsx), rendered
  inside the dashboard shell. A 404 here had no dashboard-level not-found.tsx
  in Next (it fell through to Next's built-in 404 page), so it renders that
  page's text instead of the error state.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';

  $effect(() => {
    if (page.status !== 404) console.error(page.error);
  });

  const specificMessage = $derived(
    page.error?.message && !/^not found$/i.test(page.error.message) ? page.error.message : null,
  );

  // unstable_retry(): re-run the loads and re-render the segment.
  const retry = () => goto(page.url.href, { replace: true, refreshAll: true, reset: false });
</script>

<svelte:head>
  {#if page.status === 404}
    <!-- A page's generateMetadata named the miss ("Profile not found"); otherwise
         Next's built-in not-found title. -->
    {#if specificMessage}
      <title>{specificMessage} · Ticket System</title>
    {:else}
      <title>404: This page could not be found.</title>
    {/if}
  {/if}
</svelte:head>

{#if page.status === 404}
  <div class="flex flex-col items-center justify-center py-24 text-center">
    <div class="flex items-center">
      <h1 class="mr-5 border-r border-foreground/30 pr-6 text-2xl leading-[49px] font-medium">404</h1>
      <h2 class="text-sm leading-[49px] font-normal">This page could not be found.</h2>
    </div>
  </div>
{:else}
  <EmptyState title="Something went wrong" description="This page failed to load. Try again, or come back in a moment.">
    {#snippet icon()}<TriangleAlertIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" onclick={() => void retry()}>Try again</Button>
    {/snippet}
  </EmptyState>
{/if}
