<script lang="ts">
  import Wordmark from '@/lib/components/wordmark.svelte';
  import LoginForm from './login-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Log in · Ticket System</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <LoginForm
    redirectTo={data.redirectTo}
    githubEnabled={data.githubEnabled}
    initialError={data.initialError}
    initialSso={data.initialSso}
    googleEnabled={data.googleEnabled}
    initialOfferVerification={data.offerVerification}
    passwordResetAvailable={data.passwordResetAvailable}
  />
</div>
