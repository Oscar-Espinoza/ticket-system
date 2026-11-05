<script lang="ts">
  import InboxView from '@/lib/components/inbox/inbox-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Inbox · Ticket System</title></svelte:head>

<InboxView notifications={data.notifications} issues={data.issues} />
