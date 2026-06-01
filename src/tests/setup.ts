// Vitest global setup.
// Loads environment variables from .env.local so DATABASE_URL and other secrets
// are available to tests.
//
// NOTE: we use dotenv here rather than @next/env's loadEnvConfig because Next's
// loader deliberately SKIPS .env.local when NODE_ENV === 'test' (which vitest
// sets) — that exclusion would leave DATABASE_URL undefined and break DB tests.
import { config } from 'dotenv';

config({ path: '.env.local' });
