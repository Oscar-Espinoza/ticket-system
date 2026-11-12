// drizzle-kit configuration.
// Source: https://orm.drizzle.team/docs/connect-neon

import { defineConfig } from 'drizzle-kit';
import { drizzleDatabaseUrl } from './src/tests/local-db/guard';

// The opt-in for a remote database counts only from the real environment.
const realEnv = { ...process.env };

// drizzle-kit does not load env files itself. Do what scripts/migrate.mjs does:
// read .env.local then .env (real environment variables win), no extra package.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // missing file is fine
  }
}

// `generate` and `check` need no database. `migrate`/`push`/`studio` do, and
// there is deliberately no fallback URL. A DATABASE_URL that is not on this
// machine (typically the hosted one in .env.local) is refused for them unless
// DRIZZLE_ALLOW_REMOTE=1 is set in the shell: src/tests/local-db/guard.ts.
const command = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
const url = drizzleDatabaseUrl(process.env, realEnv, command);

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  ...(url ? { dbCredentials: { url } } : {}),
});
