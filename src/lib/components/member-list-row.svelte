<!-- One member row of MemberList (the non-exported MemberRow of src/components/member-list.tsx). -->
<script lang="ts">
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
  // The wrappers refresh the page data after they resolve (React's revalidatePath).
  import { removeMember, transferOwnership, updateMemberRole } from '@/lib/actions/members';
  import { useProjectPermissions } from '@/lib/components/workspaces/permissions.svelte';
  import { PROJECT_ROLE_DESCRIPTION, PROJECT_ROLE_LABEL } from '@/components/workspaces/role-rules';
  import type { ProjectRole } from '@/lib/roles';
  import type { MemberListMember } from './member-list.svelte';

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
  // useTransition: one pending flag for every action of this row.
  let running = $state(0);
  const isPending = $derived(running > 0);
  let dialog = $state<'remove' | 'transfer' | null>(null);

  const canManage = $derived(!isSelf && perms.canManage(member.role));
  const canTransfer = $derived(perms.isOwner && !isSelf);
  const roleItems = $derived(perms.assignableRoles.map((role) => ({ value: role, label: PROJECT_ROLE_LABEL[role] })));

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
      else toast.success(`${member.name} is now ${PROJECT_ROLE_LABEL[role as ProjectRole].toLowerCase()}`);
    });
  }

  function remove() {
    void transition(async () => {
      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('memberId', member.id);
      const result = await removeMember({}, formData);
      if (result.errors?.server) toast.error(result.errors.server);
      else toast.success(`${member.name} was removed`);
    });
  }

  function transfer() {
    void transition(async () => {
      const result = await transferOwnership({ projectId, memberId: member.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`${member.name} now owns this project`);
    });
  }
</script>

<li class="flex min-h-12 items-center gap-3 px-3 py-2">
  <a
    href={`/dashboard/people/${member.userId}`}
    class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  >
    <Avatar name={member.name} src={member.image} />
    <span class="min-w-0">
      <span class="block truncate text-sm font-medium hover:underline">
        {member.name}{#if isSelf}<span class="ml-1.5 font-normal text-muted-foreground">(you)</span>{/if}
      </span>
      {#if member.email}
        <span class="block truncate text-xs text-muted-foreground">{member.email}</span>
      {/if}
    </span>
  </a>

  {#if canManage}
    <!-- Controlled like React: the trigger keeps showing the server role until the refresh lands. -->
    <Select
      items={roleItems}
      bind:value={() => member.role, (v) => v && v !== member.role && changeRole(v)}
      disabled={isPending}
    >
      <SelectTrigger size="sm" class="w-28" aria-label={`Role of ${member.name}`}>
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
            aria-label={`More actions for ${member.name}`}
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
            Transfer ownership
          </DropdownMenuItem>
        {/if}
        {#if canManage}
          <DropdownMenuItem variant="destructive" onSelect={() => (dialog = 'remove')}>
            <UserMinusIcon />
            Remove from project
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
          <AlertDialogTitle>Transfer ownership?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{member.name}</strong> becomes the owner of this project and you become an admin.
            Only the new owner can transfer it back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onclick={transfer} disabled={isPending}>Transfer ownership</AlertDialogAction>
        </AlertDialogFooter>
      {:else}
        <AlertDialogHeader>
          <AlertDialogTitle>Remove member?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{member.name}</strong> will immediately lose access to this project. You can invite
            them again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onclick={remove} disabled={isPending}>
            Remove member
          </AlertDialogAction>
        </AlertDialogFooter>
      {/if}
    </AlertDialogContent>
  </AlertDialog>
</li>
