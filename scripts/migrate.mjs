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

const pool = new Pool({ connectionString: url });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: new URL('../src/db/migrations', import.meta.url).pathname });
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
