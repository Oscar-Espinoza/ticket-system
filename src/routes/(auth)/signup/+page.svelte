<script lang="ts">
  import { m } from '@/lib/i18n';
  import Wordmark from '@/lib/components/wordmark.svelte';
  import SignupForm from './signup-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.auth_signup_page_title()}</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <SignupForm
    redirectTo={data.redirectTo}
    githubEnabled={data.githubEnabled}
    googleEnabled={data.googleEnabled}
  />
</div>
