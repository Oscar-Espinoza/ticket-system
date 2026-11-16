<script lang="ts">
  import { m } from '@/lib/i18n';
  import DocumentsList from '@/lib/components/documents/documents-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.auth_docs_page_title()}</title>
</svelte:head>

<DocumentsList projectId={data.projectId} documents={data.documents} query={data.query} />
