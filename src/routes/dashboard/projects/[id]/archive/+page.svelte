<script lang="ts">
  import { m } from '@/lib/i18n';
  import IssueBin from '@/lib/components/navigation/issue-bin.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.issues_archive_title()}</title>
</svelte:head>

<div class="flex flex-col gap-3">
  <h2 class="text-base font-medium">{m.issues_archive_title()}</h2>
  {#key params.id}
    <IssueBin mode="archive" issues={data.issues} />
  {/key}
</div>
