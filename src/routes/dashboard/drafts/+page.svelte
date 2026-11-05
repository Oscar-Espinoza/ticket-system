<script lang="ts">
  import DraftsList from '@/lib/components/productivity/drafts-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Drafts · Ticket System</title></svelte:head>

<DraftsList drafts={data.drafts} />
