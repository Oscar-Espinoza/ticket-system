// Guard for the local-db suites: they write to the database, so they run only
// when LOCAL_DB_TESTS=1 AND every host the drivers would reach is this machine.
// Kept free of imports from src/lib so it can be unit-tested without a DB.
import { parse } from 'pg-connection-string';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db.localtest.me']);

/**
 * True only when every host the drivers would actually reach is this machine:
 * the URL's host, the host node-postgres resolves after query-string overrides
 * (`?host=` wins over the URL's host), and the Neon proxy endpoint if set.
 */
export function isLocalDatabase(env: Record<string, string | undefined>) {
  const url = env.DATABASE_URL;
  if (!url) return false;
  try {
    const urlHost = new URL(url).hostname.toLowerCase();
    const effective = parse(url).host?.toLowerCase();
    if (!LOCAL_HOSTS.has(urlHost) || !effective || !LOCAL_HOSTS.has(effective)) return false;
    const proxy = env.NEON_PROXY_HOST;
    if (proxy !== undefined && !LOCAL_HOSTS.has(new URL(`http://${proxy}`).hostname.toLowerCase())) return false;
    return true;
  } catch {
    return false;
  }
}

export const localDb = process.env.LOCAL_DB_TESTS === '1' && isLocalDatabase(process.env);
