'use client';

// Preset list + calendar for "snooze until" / "remind me at". With `withTime`
// a custom day also takes a time; otherwise it means that day at 9:00.

import { useState, type FormEvent } from 'react';
import { Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { atMorning, type WhenPreset } from './when-options';

function withClock(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(day);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

const hint = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function WhenPicker({
  presets,
  onPick,
  withTime = false,
  submitLabel = 'Set',
}: {
  presets: WhenPreset[];
  onPick: (date: Date) => void;
  withTime?: boolean;
  submitLabel?: string;
}) {
  const [day, setDay] = useState<Date | undefined>();
  const [time, setTime] = useState('09:00');
  // Without a time a day means 9:00, which may already have passed today.
  const firstDay = new Date();
  firstDay.setHours(0, 0, 0, 0);
  if (!withTime) firstDay.setDate(firstDay.getDate() + 1);

  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!day) return;
    const date = withClock(day, time);
    if (date.getTime() <= Date.now()) setError('Pick a time in the future.');
    else onPick(date);
  };

  return (
    <div className="flex flex-col">
      <div role="group" aria-label="Quick options" className="flex flex-col p-1">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPick(preset.date)}
            className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground"
          >
            <Clock />
            {preset.label}
            <span className="ml-auto text-xs text-muted-foreground">{hint.format(preset.date)}</span>
          </button>
        ))}
      </div>
      <div className="border-t border-border">
        <Calendar
          mode="single"
          selected={day}
          onSelect={(date) => {
            if (!date) return;
            if (withTime) {
              setDay(date);
              setError(null);
            }
            else onPick(atMorning(date));
          }}
          disabled={{ before: firstDay }}
          className="mx-auto"
        />
      </div>
      {withTime && (
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-2">
          <Input
            type="time"
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
              setError(null);
            }}
            aria-label="Time"
            className="h-7"
            required
          />
          <Button type="submit" size="sm" disabled={!day}>
            {submitLabel}
          </Button>
        </form>
      )}
      {withTime && error && (
        <p role="alert" className="px-2 pb-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
