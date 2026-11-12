<script lang="ts">
  import Wordmark from '@/lib/components/wordmark.svelte';
  import SignupForm from './signup-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Sign up · Ticket System</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <SignupForm redirectTo={data.redirectTo} githubEnabled={data.githubEnabled} />
</div>
