<script lang="ts">
  import { m } from '@/lib/i18n';
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
      toast.success(m.projects_initiative_created({ name: name.trim() }));
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
      <DialogTitle>{m.projects_initiative_new()}</DialogTitle>
      <DialogDescription>{m.projects_initiative_new_desc()}</DialogDescription>
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
        <Label for={`${uid}-name`}>{m.common_name()}</Label>
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          id={`${uid}-name`}
          bind:value={name}
          placeholder={m.projects_initiative_name_placeholder()}
          maxlength={INITIATIVE_NAME_MAX}
          autofocus
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{m.common_description()}</span>
        <RichTextEditor
          aria-label={m.common_description()}
          value={description}
          onChange={(next) => (description = next)}
          placeholder={m.projects_initiative_description_placeholder()}
          maxLength={INITIATIVE_DESCRIPTION_MAX}
        />
      </div>
      <div role="group" aria-label={m.projects_properties()} class="flex flex-wrap gap-1.5">
        <InitiativeStatusPicker value={status} onChange={(next) => (status = next)}>
          {#snippet children({ props })}
            <Chip {...props} aria-label={m.projects_epic_status_chip({ status: INITIATIVE_STATUS_LABEL[status] })}>
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
          placeholder={m.projects_initiative_set_owner()}
          noneLabel={m.projects_initiative_no_owner()}
        >
          {#snippet children({ props })}
            <Chip {...props} aria-label={m.projects_initiative_owner_chip({ name: owner?.name ?? m.projects_initiative_owner_none() })}>
              {#if owner}
                <Avatar name={owner.name} src={owner.image} size={20} class="-my-1 size-4" />
                <span class="truncate text-foreground">{owner.name}</span>
              {:else}
                <UserRoundIcon />
                {m.projects_initiative_owner()}
              {/if}
            </Chip>
          {/snippet}
        </MemberPicker>
        <DatePicker
          value={targetDate}
          onChange={(next) => (targetDate = next)}
          clearLabel={m.projects_epic_clear_target()}
        >
          {#snippet children({ props })}
            <Chip {...props} aria-label={m.projects_epic_target_date()}>
              <CalendarDaysIcon />
              {#if targetDate}
                <span class="text-foreground">{m.projects_epic_target_on({ date: formatDueDate(targetDate) })}</span>
              {:else}
                {m.projects_epic_target_date()}
              {/if}
            </Chip>
          {/snippet}
        </DatePicker>
      </div>
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={() => setOpen(false)}>{m.common_cancel()}</Button>
        <Button type="submit" disabled={!name.trim() || pending}>{m.projects_initiative_create()}</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
