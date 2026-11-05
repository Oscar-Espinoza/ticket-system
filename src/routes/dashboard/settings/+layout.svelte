<!-- Account settings frame (port of src/app/dashboard/settings/layout.tsx).
     The dashboard layout already guarantees a session. -->
<script lang="ts">
  import { ACCOUNT_SETTINGS_NAV } from '@/components/app-shell/routes';
  import SettingsFrame from '@/lib/components/app-shell/settings-frame.svelte';
  import SettingsNav from '@/lib/components/app-shell/settings-nav.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const items = ACCOUNT_SETTINGS_NAV.map((item) => ({
    href: `/dashboard/settings/${item.segment}`,
    label: item.label,
  }));
</script>

<SettingsFrame>
  {#snippet nav()}
    <SettingsNav label="Account" {items} />
  {/snippet}
  {@render children()}
</SettingsFrame>
