<script lang="ts">
  import { Separator } from '@/lib/components/ui/separator';
  import SessionsList from '@/lib/components/security/sessions-list.svelte';
  import TwoFactorSettings from '@/lib/components/security/two-factor-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Security · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Security</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Protect your account and see where you’re signed in.
</p>

<h2 class="mb-3 text-base font-medium">Two-factor authentication</h2>
<TwoFactorSettings enabled={data.twoFactorEnabled} hasPassword={data.hasPassword} />

<Separator class="my-10" />

<h2 class="mb-3 text-base font-medium">Sessions</h2>
<SessionsList currentId={data.currentId} sessions={data.sessions} />
