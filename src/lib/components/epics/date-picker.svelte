<!-- A calendar in a popover, with "Clear" when a date is set. -->
<script lang="ts">
  import XIcon from '@lucide/svelte/icons/x';

  import { PickerPopover, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import { Calendar } from '@/lib/components/ui/calendar';
  import { fromDateString, toDateString } from '@/lib/dates';

  let {
    value,
    onChange,
    clearLabel = 'Clear date',
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null;
    onChange: (date: string | null) => void;
    clearLabel?: string;
  } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-auto">
  {#snippet content(close: () => void)}
    {@const selected = value ? fromDateString(value) : undefined}
    <div class="flex flex-col">
      <Calendar
        mode="single"
        {selected}
        defaultMonth={selected}
        autoFocus
        onSelect={(date: Date | undefined) => {
          if (!date) return;
          close();
          onChange(toDateString(date));
        }}
      />
      {#if value}
        <button
          type="button"
          class="flex items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent"
          onclick={() => {
            close();
            onChange(null);
          }}
        >
          <XIcon class="size-3.5" />
          {clearLabel}
        </button>
      {/if}
    </div>
  {/snippet}
</PickerPopover>
