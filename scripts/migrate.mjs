// Apply src/db/migrations to DATABASE_URL. Picks the driver like src/lib/db.ts:
// Neon (a *.neon.tech host, or a plain Postgres behind the local Neon proxy
// when NEON_PROXY_HOST is set) or node-postgres for any other Postgres;
// DATABASE_DRIVER=neon|pg forces one. Self-hosted images don't need this: the
// app migrates on start (SELF_HOSTED=true, src/lib/selfhost/boot.ts).
// Usage: node scripts/migrate.mjs   (reads .env.local when present)
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

function resolveDriver() {
  const forced = process.env.DATABASE_DRIVER?.trim().toLowerCase();
  if (forced === 'neon' || forced === 'pg') return forced;
  if (forced) throw new Error(`DATABASE_DRIVER must be "neon" or "pg", got "${process.env.DATABASE_DRIVER}".`);
  if (process.env.NEON_PROXY_HOST) return 'neon';
  try {
    return new URL(url).hostname.toLowerCase().endsWith('.neon.tech') ? 'neon' : 'pg';
  } catch {
    return 'pg';
  }
}

const driver = resolveDriver();
const migrationsFolder = new URL('../src/db/migrations', import.meta.url).pathname;

async function connect() {
  if (driver === 'pg') {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({ connectionString: url });
    return { pool, run: () => migrate(drizzle({ client: pool }), { migrationsFolder }) };
  }
  const { neonConfig, Pool } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const { migrate } = await import('drizzle-orm/neon-serverless/migrator');
  const proxyHost = process.env.NEON_PROXY_HOST;
  if (proxyHost) {
    neonConfig.wsProxy = () => `${proxyHost}/v2`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }
  const pool = new Pool({ connectionString: url });
  return { pool, run: () => migrate(drizzle({ client: pool }), { migrationsFolder }) };
}

// The database (or its proxy) may still be starting.
for (let attempt = 1; ; attempt++) {
  const { pool, run } = await connect();
  try {
    await run();
    console.log(`Migrations applied (${driver}).`);
    break;
  } catch (err) {
    const code = err?.cause?.code ?? err?.code;
    const transient =
      ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', '57P03'].includes(code) || err?.type === 'error';
    if (!transient || attempt >= 15) throw err;
    console.log(`Database not reachable yet (${code ?? err?.message}); retrying…`);
    await new Promise((r) => setTimeout(r, 2000));
  } finally {
    await pool.end().catch(() => undefined);
  }
}
