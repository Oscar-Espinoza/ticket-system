<script lang="ts">
  import IssueBin from '@/lib/components/navigation/issue-bin.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

<svelte:head>
  <title>Trash</title>
</svelte:head>

<div class="flex flex-col gap-3">
  <h2 class="text-base font-medium">Trash</h2>
  {#key params.id}
    <IssueBin mode="trash" issues={data.issues} />
  {/key}
</div>
