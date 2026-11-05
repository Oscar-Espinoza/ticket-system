<!--
  Project settings › Members: roster with roles for everyone; invitations
  (email + shareable link) for owners and admins.
-->
<script lang="ts">
  import InvitePanel from '@/lib/components/invite-panel.svelte';
  import MemberList from '@/lib/components/member-list.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Members · {data.projectName} · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Members</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  People who can see and work on this project. Admins manage settings and members; guests can only
  view and comment.
</p>

{#if data.canInvite}
  <InvitePanel projectId={data.projectId} inviteUrl={data.inviteUrl} pending={data.pending} />
  <Separator class="my-8" />
{/if}

<section>
  <h2 class="mb-3 text-base font-medium">
    Team members <span class="text-muted-foreground">· {data.roster.length}</span>
  </h2>
  <MemberList members={data.roster} currentUserId={data.currentUserId} projectId={data.projectId} />
</section>
