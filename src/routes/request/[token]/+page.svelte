<script lang="ts">
  import { m } from '@/lib/i18n';
  import IntakeForm from '@/lib/components/integrations/intake-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.auth_request_page_title()}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="flex min-h-screen justify-center bg-background px-4 py-12 sm:py-20">
  <div class="w-full max-w-xl">
    {#if data.projectName !== null && data.stamp !== null}
      <p class="text-sm text-muted-foreground">{data.projectName}</p>
      <h1 class="mt-1 text-2xl font-medium tracking-tight">{m.auth_request_heading()}</h1>
      <p class="mt-2 mb-8 text-sm text-muted-foreground">
        {m.auth_request_description()}
      </p>
      <IntakeForm token={data.token} stamp={data.stamp} />
    {:else}
      <div class="py-16 text-center">
        <h1 class="text-xl font-medium">{m.auth_request_unavailable()}</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          {m.auth_request_unavailable_body()}
        </p>
      </div>
    {/if}
  </div>
</main>
