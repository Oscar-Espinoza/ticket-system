<script lang="ts">
  import { m } from '@/lib/i18n';
  import InitiativeDetail from '@/lib/components/initiatives/initiative-detail.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.projects_page_title_named({ name: data.detail.initiative.name })}</title>
</svelte:head>

<!-- Remount per initiative so drafts and pending
     optimistic ops never carry over from one initiative to the next. -->
{#key data.detail.initiative.id}
<InitiativeDetail
  workspace={data.workspace}
  detail={data.detail}
  viewerId={data.viewerId}
  canDelete={data.canDelete}
/>
{/key}
