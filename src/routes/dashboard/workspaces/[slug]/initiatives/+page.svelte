<script lang="ts">
  import InitiativesList from '@/lib/components/initiatives/initiatives-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Initiatives · {data.workspace.name} · Ticket System</title>
</svelte:head>

{#key data.workspace.id}
<InitiativesList
  workspace={data.workspace}
  initiatives={data.initiatives}
  members={data.members}
  viewerId={data.viewerId}
/>
{/key}
