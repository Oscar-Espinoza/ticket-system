<!--
  Someone's local time, ticking once a minute, with the offset from the
  viewer's clock ("3h ahead"). Renders nothing for an unknown time zone.
-->
<script module lang="ts">
  import { dateFormat, m } from '@/lib/i18n';

  function formatIn(timeZone: string, now: Date): string | null {
    try {
      return dateFormat({
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        weekday: 'short',
      }).format(now);
    } catch {
      return null;
    }
  }

  /** Minutes the zone is ahead of UTC at `now`. */
  function zoneOffset(timeZone: string, now: Date): number | null {
    try {
      // en-US on purpose: only the numeric parts are read back, never shown.
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      }).formatToParts(now);
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
      const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
      return Math.round((asUtc - now.getTime()) / 60000);
    } catch {
      return null;
    }
  }

  function relativeOffset(timeZone: string, now: Date): string | null {
    const theirs = zoneOffset(timeZone, now);
    if (theirs === null) return null;
    const diff = theirs + now.getTimezoneOffset(); // getTimezoneOffset is UTC − local
    if (diff === 0) return m.auth_people_same_time();
    const hours = Math.abs(diff) / 60;
    const amount = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
    return diff > 0 ? m.auth_people_ahead({ hours: amount }) : m.auth_people_behind({ hours: amount });
  }

  const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
</script>

<script lang="ts">
  import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';

  let { timeZone }: { timeZone: string } = $props();

  // A minute-resolution clock: null on the server and during the first
  // hydration (the time depends on the viewer's clock), then polled every 15 s
  // like a store subscription. A component mounted by a
  // client-side navigation reads the clock on its first render.
  let minute = $state<number | null>(isAppHydrated() ? minuteSnapshot() : null);

  $effect(() => {
    markAppHydrated();
    minute = minuteSnapshot();
    const id = window.setInterval(() => {
      const next = minuteSnapshot();
      if (next !== minute) minute = next;
    }, 15_000);
    return () => window.clearInterval(id);
  });

  const now = $derived(minute === null ? null : new Date(minute * 60_000));
  const label = $derived(timeZone.replace(/_/g, ' '));
  const time = $derived(now ? formatIn(timeZone, now) : null);
  const offset = $derived(now ? relativeOffset(timeZone, now) : null);
</script>

{#if !now}
  <span class="text-muted-foreground">{label}</span>
{:else if time}
  <span>
    {m.auth_people_local_time({ time })}{#if offset}<span class="text-muted-foreground"
        >{' · '}{offset}</span
      >{/if}<span class="text-muted-foreground">{' · '}{label}</span>
  </span>
{/if}
