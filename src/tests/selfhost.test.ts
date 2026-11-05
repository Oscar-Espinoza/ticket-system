import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDriver } from '@/lib/db-driver';
import { cronHourUtc, msUntilNextRun } from '@/lib/selfhost/boot';

describe('resolveDriver', () => {
  it('uses neon for Neon hosts and the local Neon proxy, pg for any other Postgres', () => {
    expect(resolveDriver({ DATABASE_URL: 'postgresql://u:p@ep-x.c-7.us-east-1.aws.neon.tech/db?sslmode=require' })).toBe('neon');
    expect(resolveDriver({ DATABASE_URL: 'postgres://u:p@db.localtest.me:5432/db', NEON_PROXY_HOST: 'localhost:4444' })).toBe('neon');
    expect(resolveDriver({ DATABASE_URL: 'postgres://u:p@postgres:5432/tickets' })).toBe('pg');
    expect(resolveDriver({ DATABASE_URL: 'postgres://u:p@db.internal.corp:5432/tickets' })).toBe('pg');
    expect(resolveDriver({ DATABASE_URL: 'postgres://u:p@notneon.tech.example.com/db' })).toBe('pg');
  });

  it('honours DATABASE_DRIVER and rejects unknown values', () => {
    expect(resolveDriver({ DATABASE_DRIVER: 'pg', DATABASE_URL: 'postgresql://u:p@ep-x.neon.tech/db' })).toBe('pg');
    expect(resolveDriver({ DATABASE_DRIVER: 'NEON', DATABASE_URL: 'postgres://u:p@postgres/db' })).toBe('neon');
    expect(() => resolveDriver({ DATABASE_DRIVER: 'mysql' })).toThrow('DATABASE_DRIVER');
  });
});

describe('daily job schedule', () => {
  it('waits until the next run hour in UTC, never zero', () => {
    const at = (iso: string) => new Date(iso);
    expect(msUntilNextRun(8, at('2026-11-04T07:30:00Z'))).toBe(30 * 60_000);
    expect(msUntilNextRun(8, at('2026-11-04T08:00:00Z'))).toBe(24 * 3_600_000);
    expect(msUntilNextRun(8, at('2026-11-04T23:00:00Z'))).toBe(9 * 3_600_000);
    expect(msUntilNextRun(0, at('2026-12-31T23:59:00Z'))).toBe(60_000);
  });

  it('reads CRON_HOUR_UTC', () => {
    expect(cronHourUtc(undefined)).toBe(8);
    expect(cronHourUtc('')).toBe(8);
    expect(cronHourUtc('0')).toBe(0);
    expect(cronHourUtc('23')).toBe(23);
    for (const bad of ['24', '-1', '8.5', 'eight']) expect(() => cronHourUtc(bad)).toThrow('CRON_HOUR_UTC');
  });
});

describe('local-db test guard', () => {
  it('accepts only databases on this machine, as the driver will really connect', async () => {
    const { isLocalDatabase } = await import('./local-db/guard');
    expect(isLocalDatabase({ DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/main' })).toBe(true);
    expect(isLocalDatabase({ DATABASE_URL: 'postgres://p:p@db.localtest.me:5432/main', NEON_PROXY_HOST: 'localhost:4444' })).toBe(true);
    // An empty NEON_PROXY_HOST means "no proxy" to the driver too.
    expect(isLocalDatabase({ DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/main', NEON_PROXY_HOST: '' })).toBe(true);
    for (const env of [
      { DATABASE_URL: 'postgres://u:p@localhost/main?host=prod.example.com' }, // ?host= overrides the URL host
      { DATABASE_URL: 'postgres://u:p@localhost/main?host=/var/run/postgresql' },
      { DATABASE_URL: 'postgresql://u:p@ep-x.us-east-1.aws.neon.tech/neondb?sslmode=require' },
      { DATABASE_URL: 'postgres://u:p@db.localtest.me:5432/main', NEON_PROXY_HOST: 'proxy.example.com:4444' },
      { DATABASE_URL: 'postgres://u:p@localhost.example.com/main' },
      { DATABASE_URL: '' },
      {},
    ]) {
      expect(isLocalDatabase(env)).toBe(false);
    }
  });
});

describe('scheduleDaily (Astra review: one hung run must not stop the schedule)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps firing every day even when a run never settles or fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T07:00:00Z'));
    const { scheduleDaily } = await import('@/lib/selfhost/boot');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runs: string[] = [];
    let call = 0;
    const stop = scheduleDaily(8, () => {
      runs.push(new Date().toISOString());
      call++;
      if (call === 1) return new Promise(() => undefined); // hangs forever
      if (call === 2) return Promise.reject(new Error('boom'));
      return Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(60 * 60_000); // 08:00 day 1
    await vi.advanceTimersByTimeAsync(24 * 3_600_000); // day 2
    await vi.advanceTimersByTimeAsync(24 * 3_600_000); // day 3
    stop();
    await vi.advanceTimersByTimeAsync(24 * 3_600_000); // cancelled
    expect(runs).toEqual(['2026-11-04T08:00:00.000Z', '2026-11-05T08:00:00.000Z', '2026-11-06T08:00:00.000Z']);
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([
      '[cron] the previous daily run has not finished after a day; starting a new one',
      '[cron] daily jobs failed',
    ]);
  });
});

describe('runDailyJobs', () => {
  it('moves on from a job that hangs or throws', async () => {
    const { runDailyJobs } = await import('@/lib/cron');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const results = await runDailyJobs(
      new Date(),
      {
        stuck: () => new Promise(() => undefined),
        broken: async () => {
          throw new Error('nope');
        },
        fine: async () => 'ok',
      },
      50,
    );
    expect(results).toEqual({
      stuck: 'error: stuck still running after 50 ms',
      broken: 'error: nope',
      fine: 'ok',
    });
    errors.mockRestore();
  });

  it('does not start a second copy of a job whose timed-out run is still going (Astra re-check)', async () => {
    const { runDailyJobs } = await import('@/lib/cron');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let release!: () => void;
    let starts = 0;
    const jobs = {
      slowPulse: () => {
        starts++;
        return new Promise<string>((resolve) => {
          release = () => resolve('done');
        });
      },
    };
    expect(await runDailyJobs(new Date(), jobs, 20)).toEqual({ slowPulse: 'error: slowPulse still running after 20 ms' });
    expect(await runDailyJobs(new Date(), jobs, 20)).toEqual({ slowPulse: 'skipped: previous run still in progress' });
    expect(starts).toBe(1);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(await runDailyJobs(new Date(), { slowPulse: async () => 'again' }, 20)).toEqual({ slowPulse: 'again' });
    errors.mockRestore();
  });
});
