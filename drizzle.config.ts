// drizzle-kit configuration.
// Source: https://orm.drizzle.team/docs/connect-neon

import { defineConfig } from 'drizzle-kit';

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
// there is deliberately no fallback URL: without DATABASE_URL they fail
// instead of reaching for some hosted database.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  ...(url ? { dbCredentials: { url } } : {}),
});
