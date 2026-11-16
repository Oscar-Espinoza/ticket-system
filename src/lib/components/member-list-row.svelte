<!-- One member row of MemberList. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import CrownIcon from '@lucide/svelte/icons/crown';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
  import UserMinusIcon from '@lucide/svelte/icons/user-minus';
  import { toast } from 'svelte-sonner';

  import { Avatar, LabelChip } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  // The wrappers refresh the page data after they resolve.
  import { removeMember, transferOwnership, updateMemberRole } from '@/lib/actions/members';
  import { useProjectPermissions } from '@/lib/components/workspaces/permissions.svelte';
  import { PROJECT_ROLE_DESCRIPTION, PROJECT_ROLE_LABEL, type ProjectRole } from '@/lib/roles';
  import type { MemberListMember } from './member-list-types';

  let {
    member,
    isSelf,
    projectId,
  }: {
    member: MemberListMember;
    isSelf: boolean;
    projectId: string;
  } = $props();

  const perms = useProjectPermissions();
  // In-flight counter: one pending flag for every action of this row.
  let running = $state(0);
  const isPending = $derived(running > 0);
  let dialog = $state<'remove' | 'transfer' | null>(null);

  const canManage = $derived(!isSelf && perms.canManage(member.role));
  const canTransfer = $derived(perms.isOwner && !isSelf);
  const roleItems = $derived(perms.assignableRoles.map((role) => ({ value: role, label: PROJECT_ROLE_LABEL[role] })));

  // Placeholder swapped for the member's name in bold (messages can't hold markup).
  const NAME_MARK = '\u0001';

  async function transition(task: () => Promise<void>) {
    running++;
    try {
      await task();
    } finally {
      running--;
    }
  }

  function changeRole(role: string) {
    void transition(async () => {
      const result = await updateMemberRole({ projectId, memberId: member.id, role: role as ProjectRole });
      if (!result.ok) toast.error(result.error);
      else toast.success(m.projects_member_now_role({ name: member.name, role: PROJECT_ROLE_LABEL[role as ProjectRole].toLowerCase() }));
    });
  }

  function remove() {
    void transition(async () => {
      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('memberId', member.id);
      const result = await removeMember({}, formData);
      if (result.errors?.server) toast.error(result.errors.server);
      else toast.success(m.projects_member_removed({ name: member.name }));
    });
  }

  function transfer() {
    void transition(async () => {
      const result = await transferOwnership({ projectId, memberId: member.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(m.projects_member_now_owns({ name: member.name }));
    });
  }
</script>

{#snippet boldName(text: string)}{#each text.split(NAME_MARK) as part, i (i)}{#if i > 0}<strong>{member.name}</strong>{/if}{part}{/each}{/snippet}

<li class="flex min-h-12 items-center gap-3 px-3 py-2">
  <a
    href={`/dashboard/people/${member.userId}`}
    class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  >
    <Avatar name={member.name} src={member.image} />
    <span class="min-w-0">
      <span class="block truncate text-sm font-medium hover:underline">
        {member.name}{#if isSelf}<span class="ml-1.5 font-normal text-muted-foreground">{m.projects_you()}</span>{/if}
      </span>
      {#if member.email}
        <span class="block truncate text-xs text-muted-foreground">{member.email}</span>
      {/if}
    </span>
  </a>

  {#if canManage}
    <!-- Controlled: the trigger keeps showing the server role until the refresh lands. -->
    <Select
      items={roleItems}
      bind:value={() => member.role, (v) => v && v !== member.role && changeRole(v)}
      disabled={isPending}
    >
      <SelectTrigger size="sm" class="w-28" aria-label={m.projects_member_role_of({ name: member.name })}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {#each perms.assignableRoles as role (role)}
          <SelectItem value={role} title={PROJECT_ROLE_DESCRIPTION[role]}>
            {PROJECT_ROLE_LABEL[role]}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  {:else}
    <LabelChip color={member.role === 'owner' ? 'primary' : 'default'} title={PROJECT_ROLE_DESCRIPTION[member.role]}>
      {PROJECT_ROLE_LABEL[member.role]}
    </LabelChip>
  {/if}

  {#if canManage || canTransfer}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon-sm"
            aria-label={m.projects_member_more_actions({ name: member.name })}
            disabled={isPending}
          >
            <MoreHorizontalIcon />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {#if canTransfer}
          <DropdownMenuItem onSelect={() => (dialog = 'transfer')}>
            <CrownIcon />
            {m.projects_transfer_ownership()}
          </DropdownMenuItem>
        {/if}
        {#if canManage}
          <DropdownMenuItem variant="destructive" onSelect={() => (dialog = 'remove')}>
            <UserMinusIcon />
            {m.projects_remove_from_project()}
          </DropdownMenuItem>
        {/if}
      </DropdownMenuContent>
    </DropdownMenu>
  {:else}
    <!-- Keeps the role column aligned with rows that have a menu. -->
    <span class="size-7 shrink-0" aria-hidden="true"></span>
  {/if}

  <AlertDialog open={dialog !== null} onOpenChange={(open) => !open && (dialog = null)}>
    <AlertDialogContent>
      {#if dialog === 'transfer'}
        <AlertDialogHeader>
          <AlertDialogTitle>{m.projects_transfer_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {@render boldName(m.projects_transfer_desc({ name: NAME_MARK }))}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction onclick={transfer} disabled={isPending}>{m.projects_transfer_ownership()}</AlertDialogAction>
        </AlertDialogFooter>
      {:else}
        <AlertDialogHeader>
          <AlertDialogTitle>{m.projects_remove_member_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {@render boldName(m.projects_remove_member_desc({ name: NAME_MARK }))}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onclick={remove} disabled={isPending}>
            {m.projects_remove_member()}
          </AlertDialogAction>
        </AlertDialogFooter>
      {/if}
    </AlertDialogContent>
  </AlertDialog>
</li>
