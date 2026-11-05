// The node-postgres driver's db.batch must keep the neon-http contract the
// issue service relies on: one transaction, statements in order on one
// connection, all-or-nothing, the driver error (with .code) rethrown, and no
// leaking of the batch's connection to concurrent queries.
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '@/db/schema';
import { authDb, db, dbDriver } from '@/lib/db';
import { localDb, makeUser } from './fixtures';

type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;

describe.skipIf(!localDb || dbDriver !== 'pg')('db.batch on node-postgres', () => {
  it('runs every statement on one connection inside one transaction, in order', async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    const [inserted, seen, a, b] = await db.batch([
      db.insert(users).values({ id, name: 'b1', email: `${id}@t.local`, emailVerified: true, createdAt: now, updatedAt: now }).returning({ id: users.id }),
      db.select({ name: users.name }).from(users).where(eq(users.id, id)),
      db.execute(sql`select pg_backend_pid() as pid, txid_current() as tx`),
      db.execute(sql`select pg_backend_pid() as pid, txid_current() as tx`),
    ]);
    expect(inserted).toEqual([{ id }]);
    expect(seen).toEqual([{ name: 'b1' }]); // sees the insert before it
    expect(rowsOf(a)[0]).toEqual(rowsOf(b)[0]);
  });

  it('rolls the whole batch back and rethrows the driver error with its SQLSTATE', async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    const err = await db
      .batch([
        db.insert(users).values({ id, name: 'gone', email: `${id}@t.local`, emailVerified: true, createdAt: now, updatedAt: now }),
        db.execute(sql`select 1/0`),
      ])
      .catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('22012');
    expect(await db.select().from(users).where(eq(users.id, id))).toEqual([]);
  });

  it('keeps concurrent queries off the batch connection and away from its uncommitted rows', async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    const batch = db.batch([
      db.insert(users).values({ id, name: 'slow', email: `${id}@t.local`, emailVerified: true, createdAt: now, updatedAt: now }),
      db.execute(sql`select pg_backend_pid() as pid, pg_sleep(0.3)`),
    ]);
    await new Promise((r) => setTimeout(r, 100));
    const outside = await db.execute(sql`select pg_backend_pid() as pid`);
    const during = await db.select().from(users).where(eq(users.id, id));
    const [, inside] = await batch;
    expect(rowsOf(outside)[0].pid).not.toBe(rowsOf(inside)[0].pid);
    expect(during).toEqual([]);
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, id))).toEqual([{ id }]);
  });

  it('returns connections to the pool after failures', async () => {
    for (let i = 0; i < 25; i++) {
      await db.batch([db.execute(sql`select 1/0`)]).catch(() => undefined);
    }
    expect(rowsOf(await db.execute(sql`select 1 as ok`))[0].ok).toBe(1);
  });

  it('rejects a nested batch and leaves interactive transactions (Better Auth) working', async () => {
    await expect(
      db.batch([{ then: (res: (v: unknown) => void, rej: (e: unknown) => void) => db.batch([db.execute(sql`select 1`)]).then(res, rej) } as never]),
    ).rejects.toThrow('cannot be nested');
    const id = await makeUser('auth');
    const name = await authDb.transaction(async (tx) => {
      await tx.update(users).set({ name: 'renamed' }).where(eq(users.id, id));
      const [row] = await tx.select({ name: users.name }).from(users).where(eq(users.id, id));
      return row.name;
    });
    expect(name).toBe('renamed');
  });
});
