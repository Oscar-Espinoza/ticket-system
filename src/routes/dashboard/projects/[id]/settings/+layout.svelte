<!-- The project layout above has already checked membership (non-members 404);
     each settings action re-checks the role. -->
<script lang="ts">
  import { PROJECT_SETTINGS_NAV, projectHref } from '@/lib/components/app-shell/routes';
  import SettingsFrame from '@/lib/components/app-shell/settings-frame.svelte';
  import SettingsNav from '@/lib/components/app-shell/settings-nav.svelte';
  import type { LayoutProps } from './$types';

  let { children, params }: LayoutProps = $props();

  const items = $derived(
    PROJECT_SETTINGS_NAV.map((item) => ({
      href: projectHref(params.id, `settings/${item.segment}`),
      label: item.label,
    })),
  );
</script>

<SettingsFrame>
  {#snippet nav()}
    <SettingsNav label="Project settings" {items} />
  {/snippet}
  {@render children()}
</SettingsFrame>
