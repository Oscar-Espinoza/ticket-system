// Which database driver src/lib/db.ts uses (kept free of side effects so it can
// be imported anywhere). A *.neon.tech host, or NEON_PROXY_HOST set (Postgres
// behind the local Neon proxy), means neon; any other Postgres means pg
// (node-postgres over TCP). DATABASE_DRIVER=neon|pg overrides the guess.
// scripts/migrate.mjs repeats this logic; keep the two in step.

export type DbDriver = 'neon' | 'pg';

export function resolveDriver(env: Record<string, string | undefined> = process.env): DbDriver {
  const forced = env.DATABASE_DRIVER?.trim().toLowerCase();
  if (forced === 'neon' || forced === 'pg') return forced;
  if (forced) throw new Error(`DATABASE_DRIVER must be "neon" or "pg", got "${env.DATABASE_DRIVER}".`);
  if (env.NEON_PROXY_HOST) return 'neon';
  let host = '';
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname.toLowerCase();
  } catch {
    // Unparseable URL: let the driver report it on first use.
  }
  return host.endsWith('.neon.tech') ? 'neon' : 'pg';
}
