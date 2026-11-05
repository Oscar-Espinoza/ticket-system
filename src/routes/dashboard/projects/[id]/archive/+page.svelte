<!-- Archive (port of src/app/dashboard/projects/[id]/archive/page.tsx). -->
<script lang="ts">
  import IssueBin from '@/lib/components/navigation/issue-bin.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

<svelte:head>
  <title>Archive · Ticket System</title>
</svelte:head>

<div class="flex flex-col gap-3">
  <h2 class="text-base font-medium">Archive</h2>
  {#key params.id}
    <IssueBin mode="archive" issues={data.issues} />
  {/key}
</div>
