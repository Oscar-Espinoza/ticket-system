// Vitest global setup.
// Loads environment variables from .env.local (and other Next.js env files)
// so that DATABASE_URL and other secrets are available to tests — mirroring
// how Next.js loads env at runtime. Uses @next/env (a transitive dependency of
// Next.js) to avoid adding a separate dotenv dependency.
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());
