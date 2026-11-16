<script lang="ts">
  import { m } from '@/lib/i18n';
  import InboxView from '@/lib/components/inbox/inbox-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.editor_shell_page_title({ page: m.common_inbox() })}</title></svelte:head>

<InboxView notifications={data.notifications} issues={data.issues} />
