<script lang="ts">
  import DocumentsList from '@/lib/components/documents/documents-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Docs · Ticket System</title>
</svelte:head>

<DocumentsList projectId={data.projectId} documents={data.documents} query={data.query} />
