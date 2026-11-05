<script lang="ts">
  import InitiativeDetail from '@/lib/components/initiatives/initiative-detail.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.detail.initiative.name} · Ticket System</title>
</svelte:head>

<!-- Next remounted the page per initiative; keep that so drafts and pending
     optimistic ops never carry over from one initiative to the next. -->
{#key data.detail.initiative.id}
<InitiativeDetail
  workspace={data.workspace}
  detail={data.detail}
  viewerId={data.viewerId}
  canDelete={data.canDelete}
/>
{/key}
