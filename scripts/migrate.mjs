// Apply src/db/migrations to DATABASE_URL (Neon, or a plain Postgres behind the
// local Neon proxy when NEON_PROXY_HOST is set — see docker-compose.yml).
// Usage: node scripts/migrate.mjs   (reads .env.local when present)
import nextEnv from '@next/env';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const proxyHost = process.env.NEON_PROXY_HOST;
if (proxyHost) {
  neonConfig.wsProxy = () => `${proxyHost}/v2`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

const migrationsFolder = new URL('../src/db/migrations', import.meta.url).pathname;
// The database (or its proxy) may still be starting, e.g. under docker compose.
for (let attempt = 1; ; attempt++) {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
    console.log('Migrations applied.');
    break;
  } catch (err) {
    const code = err?.cause?.code ?? err?.code;
    const transient = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'].includes(code) || err?.type === 'error';
    if (!transient || attempt >= 15) throw err;
    console.log(`Database not reachable yet (${code ?? err?.message}); retrying…`);
    await new Promise((r) => setTimeout(r, 2000));
  } finally {
    await pool.end().catch(() => undefined);
  }
}
