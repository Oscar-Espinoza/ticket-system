// Self-hosted startup (src/instrumentation.ts, SELF_HOSTED=true): apply the
// migrations in src/db/migrations, then run the daily jobs at CRON_HOUR_UTC
// (default 08:00 UTC, the hour vercel.json uses). Migrations hold a Postgres
// advisory lock, so a second replica waits instead of migrating concurrently.
// The daily jobs run in every process that boots this way: run one app
// instance (docker-compose.yml does), or leave SELF_HOSTED unset on the extra
// replicas and call /api/cron/daily from one place instead.

import path from 'node:path';
import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { authDb, dbDriver } from '@/lib/db';

const MIGRATE_LOCK = 7_204_101; // arbitrary, app-wide advisory lock key

export async function boot() {
  try {
    const hour = cronHourUtc(); // fail fast on a bad value, before migrating
    await runMigrations();
    scheduleDailyJobs(hour);
  } catch (err) {
    console.error('[boot] self-hosted startup failed; refusing to start', err);
    process.exit(1);
  }
}

export function migrationsFolder() {
  return process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), 'src/db/migrations');
}

async function runMigrations() {
  const migrationsDir = migrationsFolder();
  if (dbDriver === 'neon') {
    await migrateNeon(authDb as Parameters<typeof migrateNeon>[0], { migrationsFolder: migrationsDir });
  } else {
    // The database may still be starting (first boot of a fresh volume restarts
    // Postgres once): retry connection failures for about a minute.
    for (let attempt = 1; ; attempt++) {
      try {
        await migratePgLocked(migrationsDir);
        break;
      } catch (err) {
        if (!isConnectionError(err) || attempt >= 30) throw err;
        console.log(`[boot] database not reachable yet (${describe(err)}); retrying…`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  console.log('[boot] database migrations are up to date');
}

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', '57P03']);

function isConnectionError(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const { code, message } = e as { code?: string; message?: string };
    if ((code && CONNECTION_CODES.has(code)) || /Connection terminated/i.test(message ?? '')) return true;
  }
  return false;
}

function describe(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  return cause?.code ?? (err as { code?: string })?.code ?? cause?.message ?? String(err);
}

/**
 * Migrates on one dedicated connection that holds a session-level advisory
 * lock, so a second replica waits. It is not the app pool: that one has a
 * statement timeout a long migration could hit.
 */
async function migratePgLocked(migrationsDir: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATE_LOCK]);
    await migratePg(drizzlePg({ client }), { migrationsFolder: migrationsDir });
  } finally {
    // Ending the session releases the lock even if unlock fails.
    await client.end().catch(() => undefined);
  }
}

export function cronHourUtc(value = process.env.CRON_HOUR_UTC): number {
  if (value === undefined || value.trim() === '') return 8;
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`CRON_HOUR_UTC must be a whole hour 0-23, got "${value}".`);
  }
  return hour;
}

/** Milliseconds from `now` to the next `hour`:00 UTC (always in the future). */
export function msUntilNextRun(hour: number, now: Date): number {
  const next = new Date(now);
  next.setUTCHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

const SCHEDULED = Symbol.for('ticket-system.dailyJobsScheduled');

function scheduleDailyJobs(hour: number) {
  const g = globalThis as { [SCHEDULED]?: boolean };
  if (g[SCHEDULED]) return; // dev reloads re-run register()
  g[SCHEDULED] = true;
  scheduleDaily(hour, async () => {
    const { runDailyJobs } = await import('@/lib/cron');
    console.log('[cron]', JSON.stringify(await runDailyJobs()));
  });
  console.log(`[boot] daily jobs scheduled for ${String(hour).padStart(2, '0')}:00 UTC`);
}

/**
 * Calls run() every day at hour:00 UTC. The next run is booked before the
 * current one starts, so a run that fails or never settles can't stop the
 * schedule. Returns a function that cancels it.
 */
export function scheduleDaily(hour: number, run: () => Promise<unknown>, now = () => new Date()) {
  let pending: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    timer = setTimeout(() => {
      arm();
      if (pending) console.error('[cron] the previous daily run has not finished after a day; starting a new one');
      const current: Promise<void> = run()
        .then(() => undefined)
        .catch((err) => console.error('[cron] daily jobs failed', err))
        .finally(() => {
          if (pending === current) pending = null;
        });
      pending = current;
    }, msUntilNextRun(hour, now()));
    timer.unref?.();
  };
  arm();
  return () => clearTimeout(timer);
}
