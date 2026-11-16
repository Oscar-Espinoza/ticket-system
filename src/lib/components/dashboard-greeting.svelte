<!--
  The time-of-day greeting must reflect the *viewer's* local time, not
  the server's (the server clock is UTC on Vercel). SSR and hydration render
  the neutral "Welcome back"; the client then
  computes the local hour.
-->
<script module lang="ts">
  import { m } from '@/lib/i18n';

  function timeOfDay(hour: number): string {
    if (hour < 12) return m.shared_greeting_morning();
    if (hour < 18) return m.shared_greeting_afternoon();
    return m.shared_greeting_evening();
  }
</script>

<script lang="ts">
  import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';

  let { name }: { name: string | null | undefined } = $props();

  // The value is read once at render time; nothing to subscribe to.
  const clientPeriod = () => timeOfDay(new Date().getHours());
  let period = $state<string | null>(isAppHydrated() ? clientPeriod() : null);
  $effect(() => {
    markAppHydrated();
    if (period === null) period = clientPeriod();
  });

  const firstName = $derived(name?.trim().split(/\s+/)[0]);
  const greeting = $derived(period ?? m.shared_greeting_welcome());
</script>

<h2 class="text-xl font-medium">
  {firstName ? m.shared_greeting_named({ greeting, name: firstName }) : greeting}
</h2>
