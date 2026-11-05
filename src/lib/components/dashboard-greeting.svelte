<!--
  IN-04: the time-of-day greeting must reflect the *viewer's* local time, not
  the server's (the server clock is UTC on Vercel). SSR and hydration render
  the neutral "Welcome back" (React's server snapshot = null); the client then
  computes the local hour. Port of src/components/dashboard-greeting.tsx.
-->
<script module lang="ts">
  function timeOfDay(hour: number): string {
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
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
  const greeting = $derived(period ? `Good ${period}` : 'Welcome back');
</script>

<h2 class="text-xl font-medium">
  {firstName ? `${greeting}, ${firstName}` : greeting}
</h2>
