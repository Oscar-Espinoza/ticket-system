// Database clients. One DATABASE_URL, two possible drivers:
//
// neon (Vercel + Neon, and Postgres behind the local Neon proxy):
// - `db`     -> neon-http (HTTP, fast single-query) for all application queries.
//               `db.batch([...])` runs its statements as one transaction.
// - `authDb` -> neon-serverless (WebSocket, interactive transactions) for Better
//               Auth. neon-http throws "No transactions support" when Better Auth
//               creates a user, so the auth instance MUST use the WebSocket driver.
//
// pg (any plain Postgres over TCP: self-hosted, docker-compose.yml):
// - one node-postgres pool behind both `db` and `authDb`. `db.batch` keeps the
//   neon-http contract: the statements run in order inside one BEGIN/COMMIT on
//   one connection, a failing statement rolls the whole batch back, and the
//   driver's error (with its SQLSTATE `.code`) is rethrown as neon-http does.
//
// The driver is picked from the URL (a *.neon.tech host, or NEON_PROXY_HOST set,
// means neon) and can be forced with DATABASE_DRIVER=neon|pg.
//
// Sources:
//   - https://orm.drizzle.team/docs/connect-neon
//   - https://orm.drizzle.team/docs/get-started-postgresql#node-postgres
//   - better-auth/better-auth#4747 (neon-http "No transactions support")

import { AsyncLocalStorage } from 'node:async_hooks';
import { neon, neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@/db/schema';
import { resolveDriver } from '@/lib/db-driver';

export type { DbDriver } from '@/lib/db-driver';

type Db = NeonHttpDatabase<typeof schema>;

function neonClients() {
  // Self-hosting / local tests: a plain Postgres behind the local Neon proxy
  // speaks the same HTTP and WebSocket protocols. Set NEON_PROXY_HOST to the
  // proxy's host:port (e.g. localhost:4444).
  const proxyHost = process.env.NEON_PROXY_HOST;
  if (proxyHost) {
    neonConfig.fetchEndpoint = `http://${proxyHost}/sql`;
    neonConfig.wsProxy = () => `${proxyHost}/v2`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }
  // App queries — HTTP (no interactive transactions, fast single-query path).
  const db = drizzleHttp({ client: neon(process.env.DATABASE_URL!), schema });
  // Better Auth writes — WebSocket (interactive transactions required).
  const authDb = drizzleWs({ client: new NeonPool({ connectionString: process.env.DATABASE_URL! }), schema });
  return { db, authDb };
}

/** The connection a running `db.batch` holds; queries issued inside it use it. */
const batchClient = new AsyncLocalStorage<pg.PoolClient>();

function pgClients() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: Number(process.env.DATABASE_POOL_MAX) || 10,
  });
  // A broken idle connection must not crash the process; the pool replaces it.
  pool.on('error', (err) => console.error('[db] idle connection error', err));

  // Route queries to the batch's connection while a batch runs. Drizzle calls
  // `pool.query` at execution time, so awaiting a query builder inside the
  // batch (same async context) lands on that connection. `pool` stays a real
  // pg.Pool, so Drizzle's own `transaction()` (Better Auth) checks out its own
  // connection as usual.
  const poolQuery = pool.query.bind(pool) as (...args: unknown[]) => unknown;
  pool.query = ((...args: unknown[]) => {
    const client = batchClient.getStore();
    return client ? (client.query as (...a: unknown[]) => unknown)(...args) : poolQuery(...args);
  }) as typeof pool.query;

  const db = drizzlePg({ client: pool, schema });
  const authDb = drizzlePg({ client: pool, schema });

  async function batch(queries: readonly PromiseLike<unknown>[]): Promise<unknown[]> {
    if (batchClient.getStore()) throw new Error('db.batch cannot be nested.');
    const client = await pool.connect();
    let broken: Error | undefined;
    try {
      await client.query('begin');
      const results = await batchClient.run(client, async () => {
        const out: unknown[] = [];
        // In order, one at a time: each statement sees the previous ones.
        for (const query of queries) out.push(await query);
        return out;
      });
      await client.query('commit');
      return results;
    } catch (err) {
      await client.query('rollback').catch((rollbackErr: Error) => {
        broken = rollbackErr; // connection is unusable: drop it from the pool
      });
      throw driverError(err);
    } finally {
      client.release(broken);
    }
  }

  return { db: Object.assign(db, { batch }) as unknown as Db, authDb };
}

/**
 * neon-http's batch throws the driver error itself; single queries throw a
 * DrizzleQueryError wrapping it. Keep that shape for pg batches too.
 */
function driverError(err: unknown): unknown {
  return err instanceof DrizzleQueryError && err.cause instanceof Error ? err.cause : err;
}

export const dbDriver = resolveDriver();
const clients = dbDriver === 'pg' ? pgClients() : neonClients();

export const db: Db = clients.db;
export const authDb = clients.authDb;
