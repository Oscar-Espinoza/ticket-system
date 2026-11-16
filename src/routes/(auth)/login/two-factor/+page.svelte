<script lang="ts">
  import { m } from '@/lib/i18n';
  import Wordmark from '@/lib/components/wordmark.svelte';
  import TwoFactorForm from './two-factor-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.auth_two_factor_page_title()}</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <TwoFactorForm redirectTo={data.redirectTo} />
</div>
