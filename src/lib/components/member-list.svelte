<!--
  Project member roster (settings › Members).
  Each row (member-list-row.svelte) links to the member's profile and, when the
  viewer's role allows it (role-rules.ts), offers a role select, "Transfer
  ownership" (owner only) and "Remove". The server actions enforce the same
  rules; hiding controls here is UX only.
-->
<script module lang="ts">
  import type { ProjectRole } from '@/lib/roles';

  const ROLE_ORDER: Record<ProjectRole, number> = { owner: 0, admin: 1, member: 2, guest: 3 };
</script>

<script lang="ts">
  import MemberRow from './member-list-row.svelte';
  import type { MemberListProps } from './member-list-types';

  let { members, currentUserId, projectId }: MemberListProps = $props();

  const sorted = $derived(
    [...members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name)),
  );
</script>

<ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
  {#each sorted as member (member.id)}
    <MemberRow {member} isSelf={member.userId === currentUserId} {projectId} />
  {/each}
</ul>
