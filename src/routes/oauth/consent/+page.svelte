<script lang="ts">
  import { m } from '@/lib/i18n';
  import ConsentForm from '@/lib/components/oauth/consent-form.svelte';
  import Wordmark from '@/lib/components/wordmark.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.auth_oauth_page_title()}</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <ConsentForm app={data.app} scopes={data.scopes} user={data.user} redirectHost={data.redirectHost} />
</div>
