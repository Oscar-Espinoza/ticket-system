<script lang="ts">
  import { m } from '@/lib/i18n';
  import DraftsList from '@/lib/components/productivity/drafts-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.issues_drafts_page_title()}</title></svelte:head>

<DraftsList drafts={data.drafts} />
