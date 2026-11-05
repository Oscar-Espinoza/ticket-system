<!-- The "Remind me" button + popover of HeaderRemind (React's local RemindButton). -->
<script lang="ts">
  import AlarmClockIcon from '@lucide/svelte/icons/alarm-clock';
  import XIcon from '@lucide/svelte/icons/x';
  import { toast } from 'svelte-sonner';

  import { cancelIssueReminder, getIssueReminder, setIssueReminder } from '@/lib/actions/notifications';
  import { formatWhen, reminderPresets } from '@/lib/components/inbox/when-options';
  import WhenPicker from '@/lib/components/inbox/when-picker.svelte';
  import PickerPopover from '@/lib/components/issue-pickers/picker-popover.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { cn } from '@/lib/utils';

  let { projectId, ticketId }: { projectId: string; ticketId: string } = $props();

  let remindAt = $state<Date | null>(null);
  let open = $state(false);
  let pending = $state(false);

  $effect(() => {
    let active = true;
    getIssueReminder({ projectId, ticketId })
      .then((result) => {
        if (active && result.ok) remindAt = result.remindAt ? new Date(result.remindAt) : null;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  });

  async function set(date: Date) {
    open = false;
    const previous = remindAt;
    remindAt = date;
    pending = true;
    try {
      const result = await setIssueReminder({ projectId, ticketId, remindAt: date.toISOString() }).catch(() => null);
      if (!result?.ok) {
        remindAt = previous;
        toast.error(result?.error ?? 'Could not set the reminder');
        return;
      }
      toast(`Reminder set for ${formatWhen(date)}`, {
        description: 'It will show up in your inbox.',
      });
    } finally {
      pending = false;
    }
  }

  async function cancel() {
    open = false;
    const previous = remindAt;
    remindAt = null;
    pending = true;
    try {
      const result = await cancelIssueReminder({ projectId, ticketId }).catch(() => null);
      if (!result?.ok) {
        remindAt = previous;
        toast.error(result?.error ?? 'Could not cancel the reminder');
      }
    } finally {
      pending = false;
    }
  }

  const label = $derived(remindAt ? `Reminder set for ${formatWhen(remindAt)}` : 'Remind me');
</script>

<PickerPopover bind:open align="end" class="w-auto min-w-64">
  {#snippet content()}
    <div class="flex flex-col">
      {#if remindAt}
        <div class="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
          <AlarmClockIcon class="size-4 shrink-0 text-primary" />
          <span class="min-w-0 flex-1 truncate">{formatWhen(remindAt)}</span>
          <Button variant="ghost" size="xs" onclick={() => void cancel()}>
            <XIcon />
            Cancel
          </Button>
        </div>
      {:else}
        <p class="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Remind me about this issue
        </p>
      {/if}
      <WhenPicker presets={reminderPresets()} onPick={(date: Date) => void set(date)} withTime submitLabel="Set reminder" />
    </div>
  {/snippet}
  {#snippet children({ props })}
    <Button
      {...props}
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={pending}
      class={cn(remindAt && 'text-primary [&_svg]:text-primary')}
    >
      <AlarmClockIcon />
    </Button>
  {/snippet}
</PickerPopover>
