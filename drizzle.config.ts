// drizzle-kit configuration.
// Source: https://orm.drizzle.team/docs/connect-neon

import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not auto-load .env.local — load it the same way Next does
// so DATABASE_URL is available for generate/migrate.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
