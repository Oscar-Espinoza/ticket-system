<!--
  Project settings › Members: roster with roles for everyone; invitations
  (email + shareable link) for owners and admins.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import InvitePanel from '@/lib/components/invite-panel.svelte';
  import MemberList from '@/lib/components/member-list.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_members_title({ name: data.projectName })}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.common_members()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_members_desc()}
</p>

{#if data.canInvite}
  <InvitePanel projectId={data.projectId} inviteUrl={data.inviteUrl} pending={data.pending} />
  <Separator class="my-8" />
{/if}

<section>
  <h2 class="mb-3 text-base font-medium">
    {m.settings_page_team_members()} <span class="text-muted-foreground">· {data.roster.length}</span>
  </h2>
  <MemberList members={data.roster} currentUserId={data.currentUserId} projectId={data.projectId} />
</section>
