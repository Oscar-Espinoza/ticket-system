<!-- The title comes from the project layout. -->
<script lang="ts">
  import IssuesView from '@/lib/components/issues/issues-view.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

<!-- Kit reuses the page across projects, so key it by project. -->
{#key params.id}
  <IssuesView issues={data.issues} defaultView={data.defaultView} />
{/key}
