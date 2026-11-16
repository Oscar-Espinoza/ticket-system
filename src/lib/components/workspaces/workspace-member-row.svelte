<!-- One workspace member: profile link, role select / chip, remove. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import UserMinusIcon from '@lucide/svelte/icons/user-minus';
  import { toast } from 'svelte-sonner';

  import {
    WORKSPACE_ROLE_LABEL,
    canChangeMemberRole,
    canRemoveMember,
    type WorkspaceMemberRow,
    type WorkspaceRole,
  } from '@/lib/workspace-types';
  import { removeWorkspaceMember, updateWorkspaceMemberRole } from '@/lib/actions/workspaces';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Avatar, LabelChip } from '@/lib/components/ui-icons';

  let {
    workspaceId,
    member,
    isSelf,
    viewerRole,
  }: {
    workspaceId: string;
    member: WorkspaceMemberRow;
    isSelf: boolean;
    viewerRole: WorkspaceRole;
  } = $props();

  const ROLE_ITEMS = [
    { value: 'admin', label: m.projects_role_admin() },
    { value: 'member', label: m.projects_role_member() },
  ];

  let isPending = $state(false);
  const canChangeRole = $derived(canChangeMemberRole(viewerRole, member.role, isSelf));
  const canRemove = $derived(canRemoveMember(viewerRole, member.role, isSelf));

  async function changeRole(role: string) {
    isPending = true;
    try {
      const result = await updateWorkspaceMemberRole({
        workspaceId,
        userId: member.userId,
        role: role as 'admin' | 'member',
      });
      if (!result) return;
      if (!result.ok) toast.error(result.error);
      else toast.success(m.projects_ws_member_now({ name: member.name, role: role === 'admin' ? m.projects_role_admin() : m.projects_role_member() }));
    } finally {
      isPending = false;
    }
  }

  async function remove() {
    isPending = true;
    try {
      const result = await removeWorkspaceMember({ workspaceId, userId: member.userId });
      if (!result) return;
      if (!result.ok) toast.error(result.error);
      else toast.success(m.projects_member_removed({ name: member.name }));
    } finally {
      isPending = false;
    }
  }
</script>

<li class="flex min-h-12 items-center gap-3 px-3 py-2">
  <a
    href="/dashboard/people/{member.userId}"
    class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  >
    <Avatar name={member.name} src={member.image} />
    <span class="min-w-0">
      <span class="block truncate text-sm font-medium hover:underline">
        {member.name}{#if isSelf}<span class="ml-1.5 font-normal text-muted-foreground">{m.projects_you()}</span>{/if}
      </span>
      <span class="block truncate text-xs text-muted-foreground">{member.email}</span>
    </span>
  </a>
  {#if canChangeRole}
    <!-- Strictly controlled: shows the server role until the refresh lands. -->
    <Select items={ROLE_ITEMS} bind:value={() => member.role, (v) => changeRole(v)} disabled={isPending}>
      <SelectTrigger size="sm" class="w-28" aria-label={m.projects_ws_role_of({ name: member.name })}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="admin">{m.projects_role_admin()}</SelectItem>
        <SelectItem value="member">{m.projects_role_member()}</SelectItem>
      </SelectContent>
    </Select>
  {:else}
    <LabelChip color={member.role === 'owner' ? 'primary' : 'default'}>
      {WORKSPACE_ROLE_LABEL[member.role]}
    </LabelChip>
  {/if}
  {#if canRemove}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon-sm" aria-label={m.projects_ws_member_actions({ name: member.name })} disabled={isPending}>
            {#if isPending}<LoaderCircleIcon class="animate-spin" />{:else}<EllipsisIcon />{/if}
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={remove}>
          <UserMinusIcon />
          {m.projects_ws_remove_from()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {:else}
    <span class="size-7 shrink-0" aria-hidden="true"></span>
  {/if}
</li>
