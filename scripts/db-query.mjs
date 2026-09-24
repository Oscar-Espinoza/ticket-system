// Dev helper: run one read query against DATABASE_URL (from .env.local).
import nextEnv from '@next/env';
import { neon } from '@neondatabase/serverless';

nextEnv.loadEnvConfig(process.cwd());
const sql = neon(process.env.DATABASE_URL);
console.log(JSON.stringify(await sql(process.argv[2]), null, 1));
