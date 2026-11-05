import { describe, expect, it } from 'vitest';
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
