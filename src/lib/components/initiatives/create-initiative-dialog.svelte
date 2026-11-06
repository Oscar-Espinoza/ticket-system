<script lang="ts">
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import { createInitiative } from '@/lib/actions/initiatives';
  import Chip from '@/lib/components/epics/chip-button.svelte';
  import DatePicker from '@/lib/components/epics/date-picker.svelte';
  import MemberPicker from '@/lib/components/epics/member-picker.svelte';
  import RichTextEditor from '@/lib/components/epics/rich-text-editor.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Avatar } from '@/lib/components/ui-icons';
  import { formatDueDate } from '@/lib/dates';
  import type { IssueUser } from '@/lib/issue-model';
  import {
    INITIATIVE_DESCRIPTION_MAX,
    INITIATIVE_NAME_MAX,
    INITIATIVE_STATUS_LABEL,
    initiativesPath,
    type InitiativeStatus,
  } from '@/lib/initiative-model';
  import InitiativeStatusIcon from './initiative-status-icon.svelte';
  import InitiativeStatusPicker from './initiative-status-picker.svelte';

  let {
    open = $bindable(false),
    onOpenChange,
    workspaceId,
    slug,
    members,
    viewerId,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceId: string;
    slug: string;
    members: IssueUser[];
    viewerId: string;
  } = $props();

  const uid = $props.id();
  let pending = $state(false);
  let name = $state('');
  let description = $state('');
  let status = $state<InitiativeStatus>('planned');
  // svelte-ignore state_referenced_locally
  let ownerId = $state<string | null>(viewerId);
  let targetDate = $state<string | null>(null);
  let error = $state<string | null>(null);
  const owner = $derived(members.find((m) => m.id === ownerId));

  const setOpen = (next: boolean) => {
    open = next;
    onOpenChange(next);
  };

  async function submit(event?: Event) {
    event?.preventDefault();
    if (!name.trim() || pending) return;
    pending = true;
    try {
      const result = await createInitiative({
        workspaceId,
        name,
        description,
        status,
        ownerId,
        targetDate,
      });
      if (!result.ok) {
        error = result.error;
        return;
      }
      toast.success(`Created initiative “${name.trim()}”`);
      name = '';
      description = '';
      status = 'planned';
      targetDate = null;
      error = null;
      setOpen(false);
      if (result.id) void goto(initiativesPath(slug, result.id));
    } finally {
      pending = false;
    }
  }
</script>

<Dialog bind:open={() => open, setOpen}>
  <DialogContent class="sm:max-w-xl">
    <DialogHeader>
      <DialogTitle>New initiative</DialogTitle>
      <DialogDescription>A goal that groups epics across this workspace’s projects.</DialogDescription>
    </DialogHeader>
    <!-- ⌘Enter submits -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form
      onsubmit={(event) => void submit(event)}
      onkeydown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(event);
      }}
      class="flex flex-col gap-4"
    >
      <div class="flex flex-col gap-1.5">
        <Label for={`${uid}-name`}>Name</Label>
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          id={`${uid}-name`}
          bind:value={name}
          placeholder="Initiative name"
          maxlength={INITIATIVE_NAME_MAX}
          autofocus
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Description</span>
        <RichTextEditor
          aria-label="Description"
          value={description}
          onChange={(next) => (description = next)}
          placeholder="Why does this matter? Markdown supported."
          maxLength={INITIATIVE_DESCRIPTION_MAX}
        />
      </div>
      <div role="group" aria-label="Properties" class="flex flex-wrap gap-1.5">
        <InitiativeStatusPicker value={status} onChange={(next) => (status = next)}>
          {#snippet children({ props })}
            <Chip {...props} aria-label={`Status: ${INITIATIVE_STATUS_LABEL[status]}`}>
              <InitiativeStatusIcon {status} />
              <span class="text-foreground">{INITIATIVE_STATUS_LABEL[status]}</span>
            </Chip>
          {/snippet}
        </InitiativeStatusPicker>
        <MemberPicker
          value={ownerId}
          {members}
          {viewerId}
          onChange={(next) => (ownerId = next)}
          placeholder="Set owner…"
          noneLabel="No owner"
        >
          {#snippet children({ props })}
            <Chip {...props} aria-label={`Owner: ${owner?.name ?? 'none'}`}>
              {#if owner}
                <Avatar name={owner.name} src={owner.image} size={20} class="-my-1 size-4" />
                <span class="truncate text-foreground">{owner.name}</span>
              {:else}
                <UserRoundIcon />
                Owner
              {/if}
            </Chip>
          {/snippet}
        </MemberPicker>
        <DatePicker
          value={targetDate}
          onChange={(next) => (targetDate = next)}
          clearLabel="Clear target date"
        >
          {#snippet children({ props })}
            <Chip {...props} aria-label="Target date">
              <CalendarDaysIcon />
              {#if targetDate}
                <span class="text-foreground">Target {formatDueDate(targetDate)}</span>
              {:else}
                Target date
              {/if}
            </Chip>
          {/snippet}
        </DatePicker>
      </div>
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" disabled={!name.trim() || pending}>Create initiative</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
