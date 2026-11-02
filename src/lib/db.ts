// Dual Neon Drizzle drivers sharing one DATABASE_URL.
//
// - `db`     -> neon-http (HTTP, fast single-query) for all application queries.
// - `authDb` -> neon-serverless (WebSocket, interactive transactions) for Better
//               Auth. neon-http throws "No transactions support" when Better Auth
//               creates a user, so the auth instance MUST use the WebSocket driver.
//
// Sources:
//   - https://orm.drizzle.team/docs/connect-neon
//   - better-auth/better-auth#4747 (neon-http "No transactions support")

import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import * as schema from '@/db/schema';

// Self-hosting / local tests: a plain Postgres behind the local Neon proxy
// (docker-compose.yml, service `neon-proxy`) speaks the same HTTP and WebSocket
// protocols. Set NEON_PROXY_HOST to the proxy's host:port (e.g. neon-proxy:4444).
const proxyHost = process.env.NEON_PROXY_HOST;
if (proxyHost) {
  neonConfig.fetchEndpoint = `http://${proxyHost}/sql`;
  neonConfig.wsProxy = () => `${proxyHost}/v2`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

// App queries — HTTP (no interactive transactions, fast single-query path).
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzleHttp({ client: sql, schema });

// Better Auth writes — WebSocket (interactive transactions required).
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const authDb = drizzleWs({ client: pool, schema });
