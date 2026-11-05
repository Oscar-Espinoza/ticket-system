<script lang="ts">
  import IntakeForm from '@/lib/components/integrations/intake-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Submit a request · Ticket System</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="flex min-h-screen justify-center bg-background px-4 py-12 sm:py-20">
  <div class="w-full max-w-xl">
    {#if data.projectName !== null && data.stamp !== null}
      <p class="text-sm text-muted-foreground">{data.projectName}</p>
      <h1 class="mt-1 text-2xl font-medium tracking-tight">Submit a request</h1>
      <p class="mt-2 mb-8 text-sm text-muted-foreground">
        Report a bug or ask for something new. The team gets it as an issue to review.
      </p>
      <IntakeForm token={data.token} stamp={data.stamp} />
    {:else}
      <div class="py-16 text-center">
        <h1 class="text-xl font-medium">This form isn&rsquo;t available</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          The link may have changed or the form was turned off. Ask the team for a new link.
        </p>
      </div>
    {/if}
  </div>
</main>
