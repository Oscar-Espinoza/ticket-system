<script lang="ts">
  import { m } from '@/lib/i18n';
  import InboxIcon from '@lucide/svelte/icons/inbox';

  import FeatureOffState from '@/lib/components/cycles/feature-off.svelte';
  import TriageView from '@/lib/components/triage/triage-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.issues_triage_scope()}</title></svelte:head>

{#snippet icon()}<InboxIcon />{/snippet}

{#if data.featureOff}
  <FeatureOffState
    projectId={data.projectId}
    {icon}
    title={m.issues_triage_off()}
    description={m.issues_triage_off_description()}
    canEnable={data.canEnable}
  />
{:else}
  <TriageView issues={data.issues} candidates={data.candidates} />
{/if}
