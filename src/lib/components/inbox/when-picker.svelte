<!--
  Preset list + calendar for "snooze until" / "remind me at". With `withTime`
  a custom day also takes a time; otherwise it means that day at 9:00.
-->
<script lang="ts">
  import Clock from '@lucide/svelte/icons/clock';

  import { Button } from '@/lib/components/ui/button';
  import { Calendar } from '@/lib/components/ui/calendar';
  import { Input } from '@/lib/components/ui/input';
  import { atMorning, type WhenPreset } from '@/lib/components/inbox/when-options';

  let {
    presets,
    onPick,
    withTime = false,
    submitLabel = 'Set',
  }: {
    presets: WhenPreset[];
    onPick: (date: Date) => void;
    withTime?: boolean;
    submitLabel?: string;
  } = $props();

  function withClock(day: Date, time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date(day);
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return date;
  }

  const hint = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  let day = $state<Date | undefined>();
  let time = $state('09:00');
  let error = $state<string | null>(null);

  // Without a time a day means 9:00, which may already have passed today.
  const firstDay = $derived.by(() => {
    const first = new Date();
    first.setHours(0, 0, 0, 0);
    if (!withTime) first.setDate(first.getDate() + 1);
    return first;
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!day) return;
    const date = withClock(day, time);
    if (date.getTime() <= Date.now()) error = 'Pick a time in the future.';
    else onPick(date);
  }
</script>

<div class="flex flex-col">
  <div role="group" aria-label="Quick options" class="flex flex-col p-1">
    {#each presets as preset (preset.id)}
      <button
        type="button"
        onclick={() => onPick(preset.date)}
        class="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground"
      >
        <Clock />
        {preset.label}
        <span class="ml-auto text-xs text-muted-foreground">{hint.format(preset.date)}</span>
      </button>
    {/each}
  </div>
  <div class="border-t border-border">
    <Calendar
      mode="single"
      selected={day}
      onSelect={(date: Date | undefined) => {
        if (!date) return;
        if (withTime) {
          day = date;
          error = null;
        } else onPick(atMorning(date));
      }}
      disabled={{ before: firstDay }}
      class="mx-auto"
    />
  </div>
  {#if withTime}
    <form onsubmit={submit} class="flex items-center gap-2 border-t border-border p-2">
      <Input
        type="time"
        bind:value={() => time, (v) => {
          time = v;
          error = null;
        }}
        aria-label="Time"
        class="h-7"
        required
      />
      <Button type="submit" size="sm" disabled={!day}>{submitLabel}</Button>
    </form>
  {/if}
  {#if withTime && error}
    <p role="alert" class="px-2 pb-2 text-xs text-destructive">{error}</p>
  {/if}
</div>
