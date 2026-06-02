'use client';

// IN-04: the time-of-day greeting must reflect the *viewer's* local time, not
// the server's. On Vercel the server clock is UTC, so computing morning/
// afternoon/evening server-side would be wrong for most users.
//
// useSyncExternalStore is the idiomatic way to read a client-only value without
// a hydration mismatch: the server snapshot is null (renders the neutral
// "Welcome back"), and the client snapshot computes the local hour. No effect,
// no setState-in-effect.

import { useSyncExternalStore } from 'react';

function timeOfDay(hour: number): string {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

// The value is read-once at render time; nothing to subscribe to.
const subscribe = () => () => {};

export function DashboardGreeting({ name }: { name: string | null | undefined }) {
  const firstName = name?.trim().split(/\s+/)[0];

  const period = useSyncExternalStore(
    subscribe,
    () => timeOfDay(new Date().getHours()), // client snapshot — local hour
    () => null, // server snapshot — neutral greeting during SSR/hydration
  );

  const greeting = period ? `Good ${period}` : 'Welcome back';

  return (
    <h2 className="text-xl font-semibold">
      {firstName ? `${greeting}, ${firstName}` : greeting}
    </h2>
  );
}
