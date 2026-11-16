<script lang="ts">
  import { m } from '@/lib/i18n';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import CalendarRangeIcon from '@lucide/svelte/icons/calendar-range';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import { createEpic } from '@/lib/actions/epics';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
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
  import {
    DEFAULT_EPIC_COLOR,
    EPIC_DESCRIPTION_MAX,
    EPIC_NAME_MAX,
    EPIC_STATUS_LABEL,
    epicPath,
    type EpicStatus,
  } from '@/lib/epic-model';
  import Chip from './chip-button.svelte';
  import ColorSwatches from './color-swatches.svelte';
  import DatePicker from './date-picker.svelte';
  import EpicStatusIcon from './epic-status-icon.svelte';
  import EpicStatusPicker from './epic-status-picker.svelte';
  import MemberPicker from './member-picker.svelte';
  import RichTextEditor from './rich-text-editor.svelte';

  let {
    open = $bindable(false),
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  } = $props();

  const data = useProjectData();
  const uid = $props.id();
  let pending = $state(false);
  let name = $state('');
  let description = $state('');
  let status = $state<EpicStatus>('planned');
  // svelte-ignore state_referenced_locally
  let leadId = $state<string | null>(data.viewer.id);
  let startDate = $state<string | null>(null);
  let targetDate = $state<string | null>(null);
  let color = $state(DEFAULT_EPIC_COLOR);
  let error = $state<string | null>(null);
  const lead = $derived(data.members.find((m) => m.id === leadId));

  const setOpen = (next: boolean) => {
    open = next;
    onOpenChange(next);
  };

  const reset = () => {
    name = '';
    description = '';
    status = 'planned';
    leadId = data.viewer.id;
    startDate = null;
    targetDate = null;
    color = DEFAULT_EPIC_COLOR;
    error = null;
  };

  async function submit(event?: Event, openAfter = false) {
    event?.preventDefault();
    if (!name.trim() || pending) return;
    pending = true;
    try {
      const projectId = data.project.id;
      const result = await createEpic({
        projectId,
        name,
        description,
        status,
        leadId,
        startDate,
        targetDate,
        color,
      });
      if (!result.ok) {
        error = result.error;
        return;
      }
      toast.success(m.projects_epic_created({ name: name.trim() }));
      reset();
      setOpen(false);
      if (openAfter && result.id) void goto(epicPath(projectId, result.id));
    } finally {
      pending = false;
    }
  }
</script>

<Dialog
  bind:open={
    () => open,
    (next) => {
      if (!next) error = null;
      setOpen(next);
    }
  }
>
  <DialogContent class="sm:max-w-xl">
    <DialogHeader>
      <DialogTitle>{m.projects_epic_new()}</DialogTitle>
      <DialogDescription>
        {m.projects_epic_new_desc({ key: data.project.ticketKey })}
      </DialogDescription>
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
          placeholder={m.projects_epic_name_placeholder()}
          maxlength={EPIC_NAME_MAX}
          autofocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${uid}-error` : undefined}
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{m.common_description()}</span>
        <RichTextEditor
          aria-label={m.common_description()}
          value={description}
          onChange={(next) => (description = next)}
          placeholder={m.projects_epic_description_placeholder()}
          maxLength={EPIC_DESCRIPTION_MAX}
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{m.projects_color()}</span>
        <ColorSwatches value={color} onChange={(next) => (color = next)} />
      </div>

      <div role="group" aria-label={m.projects_properties()} class="flex flex-wrap gap-1.5">
        <EpicStatusPicker value={status} onChange={(next) => (status = next)}>
          {#snippet children({ props })}
            <Chip {...props} aria-label={m.projects_epic_status_chip({ status: EPIC_STATUS_LABEL[status] })}>
              <EpicStatusIcon {status} />
              <span class="text-foreground">{EPIC_STATUS_LABEL[status]}</span>
            </Chip>
          {/snippet}
        </EpicStatusPicker>
        <MemberPicker
          value={leadId}
          members={data.members}
          viewerId={data.viewer.id}
          onChange={(next) => (leadId = next)}
        >
          {#snippet children({ props })}
            <Chip {...props} aria-label={m.projects_epic_lead_chip({ name: lead?.name ?? m.projects_epic_lead_none() })}>
              {#if lead}
                <Avatar name={lead.name} src={lead.image} size={20} class="-my-1 size-4" />
                <span class="truncate text-foreground">{lead.name}</span>
              {:else}
                <UserRoundIcon />
                {m.projects_epic_lead()}
              {/if}
            </Chip>
          {/snippet}
        </MemberPicker>
        <DatePicker value={startDate} onChange={(next) => (startDate = next)} clearLabel={m.projects_epic_clear_start()}>
          {#snippet children({ props })}
            <Chip {...props} aria-label={m.projects_epic_start_date()}>
              <CalendarRangeIcon />
              {#if startDate}
                <span class="text-foreground">{m.projects_epic_start_on({ date: formatDueDate(startDate) })}</span>
              {:else}
                {m.projects_epic_start_date()}
              {/if}
            </Chip>
          {/snippet}
        </DatePicker>
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
        <p id={`${uid}-error`} role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={() => setOpen(false)}>{m.common_cancel()}</Button>
        <Button
          type="button"
          variant="outline"
          disabled={!name.trim() || pending}
          onclick={() => void submit(undefined, true)}
        >
          {m.projects_create_and_open()}
        </Button>
        <Button type="submit" disabled={!name.trim() || pending}>{m.projects_epic_create()}</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
