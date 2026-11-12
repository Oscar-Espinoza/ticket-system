// The ONE owner of "is this database on this machine". Used by the local-db
// suites, the vitest setup (src/tests/setup.ts) and drizzle.config.ts, so none
// of them can hand a hosted database to a test or to drizzle-kit by default.
// Kept free of imports from src/lib so it can be unit-tested and loaded from
// drizzle.config.ts without a DB or app code.
import { parse } from 'pg-connection-string';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
// Public DNS name (operated by a third party, resolves to 127.0.0.1) that the
// Neon-proxy setup uses so the Neon driver gets a hostname. Trusted only with
// that setup: see isLocalDatabase.
const NEON_PROXY_URL_HOST = 'db.localtest.me';

function hostname(hostPort: string) {
  return new URL(`http://${hostPort}`).hostname.toLowerCase();
}

/**
 * True only when every host the drivers would actually reach is this machine:
 * the URL's host, the host node-postgres resolves after query-string overrides
 * (`?host=` wins over the URL's host), and the Neon proxy endpoint if set.
 *
 * `db.localtest.me` counts as local only when the Neon driver reaches it
 * through a loopback NEON_PROXY_HOST (the proxy replaces the DNS lookup: the
 * name is never resolved). With the pg driver, or without a proxy, it would be
 * a real DNS lookup of a name this repo does not control, so it is refused.
 */
export function isLocalDatabase(env: Record<string, string | undefined>) {
  const url = env.DATABASE_URL;
  if (!url) return false;
  try {
    const urlHost = new URL(url).hostname.toLowerCase();
    const effective = parse(url).host?.toLowerCase();
    if (!effective) return false;
    const proxy = env.NEON_PROXY_HOST ? hostname(env.NEON_PROXY_HOST) : undefined;
    if (proxy && !LOOPBACK_HOSTS.has(proxy)) return false;
    const viaLocalProxy = Boolean(proxy) && env.DATABASE_DRIVER?.trim().toLowerCase() !== 'pg';
    const hostOk = (host: string) => LOOPBACK_HOSTS.has(host) || (host === NEON_PROXY_URL_HOST && viaLocalProxy);
    return hostOk(urlHost) && hostOk(effective);
  } catch {
    return false;
  }
}

const HINT =
  'Use a throwaway local Postgres, for example ' +
  '`DATABASE_URL=postgres://postgres:postgres@localhost:5433/<db>` (see docs/SELF_HOSTING.md).';

/**
 * Vitest setup guard: a non-local DATABASE_URL must never reach a test (six
 * unit tests write to whatever DATABASE_URL is set). No URL at all is fine:
 * tests that need a database then fail on their own.
 */
export function assertTestDatabaseIsLocal(env: Record<string, string | undefined>) {
  if (!env.DATABASE_URL || isLocalDatabase(env)) return;
  throw new Error(
    'Refusing to run tests: DATABASE_URL (from the environment or .env.local) does not point at this machine, ' +
      `and several tests write to it. ${HINT} Prefix the command with it, e.g. ` +
      '`DATABASE_URL=postgres://postgres:postgres@localhost:5433/main DATABASE_DRIVER=pg npx vitest run <file>`.',
  );
}

export class RemoteDatabaseRefused extends Error {}

// drizzle-kit commands that never open a connection.
const OFFLINE_COMMANDS = new Set(['generate', 'check', 'up', 'drop', 'export']);

/**
 * The URL drizzle.config.ts may hand to drizzle-kit. `realEnv` is the
 * environment as it was BEFORE .env files were loaded: the opt-in
 * DRIZZLE_ALLOW_REMOTE=1 counts only from there, never from an env file.
 * Offline commands (generate, check, ...) get no URL for a remote database and
 * never throw; every other command (push, migrate, studio, pull, ...) refuses.
 */
export function drizzleDatabaseUrl(
  env: Record<string, string | undefined>,
  realEnv: Record<string, string | undefined>,
  command: string | undefined,
): string | undefined {
  const url = env.DATABASE_URL;
  if (!url) return undefined;
  if (isLocalDatabase(env)) return url;
  if (realEnv.DRIZZLE_ALLOW_REMOTE === '1') return url;
  if (!command || OFFLINE_COMMANDS.has(command)) return undefined;
  throw new RemoteDatabaseRefused(
    `drizzle-kit ${command} refused: DATABASE_URL does not point at this machine. ` +
      `Use a local database: DATABASE_URL=postgres://postgres:postgres@localhost:5433/<db> npx drizzle-kit ${command}. ` +
      'To really target a remote database, set DRIZZLE_ALLOW_REMOTE=1 in the shell environment (an env file cannot set it). ' +
      'Deployments migrate with `npm run db:migrate`.',
  );
}

// LOCAL_DB_TESTS=1 means "run the database suites". If the database is not
// local, skipping them quietly would turn CI (or a local run) green with
// everything skipped, so that case is an error, not a skip.
if (process.env.LOCAL_DB_TESTS === '1' && !isLocalDatabase(process.env)) {
  throw new Error(`LOCAL_DB_TESTS=1 but DATABASE_URL is missing or not local, so the database suites would skip. ${HINT}`);
}

export const localDb = process.env.LOCAL_DB_TESTS === '1';
