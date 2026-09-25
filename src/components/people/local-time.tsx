'use client';

// Someone's local time, ticking once a minute, with the offset from the
// viewer's clock ("3h ahead"). Renders nothing for an unknown time zone.

import { useSyncExternalStore } from 'react';

function formatIn(timeZone: string, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, {
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
  if (diff === 0) return 'same time as you';
  const hours = Math.abs(diff) / 60;
  const amount = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  return `${amount} ${diff > 0 ? 'ahead' : 'behind'}`;
}

// A minute-resolution clock: stable snapshots between ticks, null on the
// server (the time depends on the viewer's clock, so it renders after hydration).
function subscribeMinute(onChange: () => void) {
  const id = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(id);
}
const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
const serverSnapshot = () => null;

export function LocalTime({ timeZone }: { timeZone: string }) {
  const minute = useSyncExternalStore(subscribeMinute, minuteSnapshot, serverSnapshot);
  const now = minute === null ? null : new Date(minute * 60_000);

  if (!now) return <span className="text-muted-foreground">{timeZone.replace(/_/g, ' ')}</span>;
  const time = formatIn(timeZone, now);
  if (!time) return null;
  const offset = relativeOffset(timeZone, now);
  return (
    <span>
      <span className="text-foreground">{time}</span> local time
      {offset && <span className="text-muted-foreground"> · {offset}</span>}
      <span className="text-muted-foreground"> · {timeZone.replace(/_/g, ' ')}</span>
    </span>
  );
}
