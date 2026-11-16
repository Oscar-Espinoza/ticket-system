<script lang="ts">
  import { m } from '@/lib/i18n';
  import InitiativesList from '@/lib/components/initiatives/initiatives-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.projects_initiatives_page_title({ name: data.workspace.name })}</title>
</svelte:head>

{#key data.workspace.id}
<InitiativesList
  workspace={data.workspace}
  initiatives={data.initiatives}
  members={data.members}
  viewerId={data.viewerId}
/>
{/key}
