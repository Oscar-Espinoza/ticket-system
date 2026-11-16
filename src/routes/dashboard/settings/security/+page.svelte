<script lang="ts">
  import { m } from '@/lib/i18n';
  import { Separator } from '@/lib/components/ui/separator';
  import SessionsList from '@/lib/components/security/sessions-list.svelte';
  import TwoFactorSettings from '@/lib/components/security/two-factor-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_security_title()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_security()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_security_desc()}
</p>

<h2 class="mb-3 text-base font-medium">{m.settings_page_two_factor()}</h2>
<TwoFactorSettings enabled={data.twoFactorEnabled} hasPassword={data.hasPassword} />

<Separator class="my-10" />

<h2 class="mb-3 text-base font-medium">{m.settings_page_sessions()}</h2>
<SessionsList currentId={data.currentId} sessions={data.sessions} />
