<script lang="ts">
  import DocumentView from '@/lib/components/documents/document-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.document.title}</title>
</svelte:head>

<!-- Keyed by id: switching docs must never reuse the previous doc's editor. -->
{#key data.document.id}
  <DocumentView document={data.document} backlinks={data.backlinks} />
{/key}
