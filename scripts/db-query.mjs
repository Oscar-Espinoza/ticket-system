// Dev helper: run one read query against DATABASE_URL (from .env.local).
import { neon } from '@neondatabase/serverless';

// Load .env.local / .env like the app does in dev (real env vars win).
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // missing file is fine
  }
}
const sql = neon(process.env.DATABASE_URL);
console.log(JSON.stringify(await sql(process.argv[2]), null, 1));
