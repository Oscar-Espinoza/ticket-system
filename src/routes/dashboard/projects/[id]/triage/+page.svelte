<script lang="ts">
  import InboxIcon from '@lucide/svelte/icons/inbox';

  import FeatureOffState from '@/lib/components/cycles/feature-off.svelte';
  import TriageView from '@/lib/components/triage/triage-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Triage · Ticket System</title></svelte:head>

{#snippet icon()}<InboxIcon />{/snippet}

{#if data.featureOff}
  <FeatureOffState
    projectId={data.projectId}
    {icon}
    title="Triage is off"
    description="Route new issues from the intake form, the API and people outside the project through a review queue before they reach the backlog."
    canEnable={data.canEnable}
  />
{:else}
  <TriageView issues={data.issues} candidates={data.candidates} />
{/if}
