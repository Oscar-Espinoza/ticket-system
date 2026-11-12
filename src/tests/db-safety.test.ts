// Nothing local (tests, drizzle-kit) may reach a non-local database by default.
// The single owner of "is this database local" is src/tests/local-db/guard.ts.
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertTestDatabaseIsLocal, drizzleDatabaseUrl } from './local-db/guard';

const LOCAL = 'postgres://postgres:postgres@localhost:5433/main';
const HOSTED = 'postgresql://u:p@ep-fake.example.invalid/neondb?sslmode=require';

describe('test setup guard', () => {
  it('accepts a local or missing DATABASE_URL', () => {
    expect(() => assertTestDatabaseIsLocal({ DATABASE_URL: LOCAL })).not.toThrow();
    expect(() => assertTestDatabaseIsLocal({})).not.toThrow();
  });

  it('refuses a hosted DATABASE_URL, telling the developer what to set', () => {
    expect(() => assertTestDatabaseIsLocal({ DATABASE_URL: HOSTED })).toThrow(/DATABASE_URL=postgres:\/\/postgres:postgres@localhost/);
  });
});

describe('drizzle.config.ts database URL', () => {
  it('passes a local URL through for every command', () => {
    expect(drizzleDatabaseUrl({ DATABASE_URL: LOCAL }, {}, 'push')).toBe(LOCAL);
    expect(drizzleDatabaseUrl({}, {}, 'push')).toBeUndefined();
  });

  it('refuses a hosted URL for commands that connect, but not for generate', () => {
    for (const command of ['push', 'migrate', 'studio', 'pull', 'whatever']) {
      expect(() => drizzleDatabaseUrl({ DATABASE_URL: HOSTED }, {}, command)).toThrow(/DRIZZLE_ALLOW_REMOTE=1/);
    }
    expect(drizzleDatabaseUrl({ DATABASE_URL: HOSTED }, {}, 'generate')).toBeUndefined();
  });

  it('honours DRIZZLE_ALLOW_REMOTE only from the real environment, not from an env file', () => {
    // The env file put DRIZZLE_ALLOW_REMOTE into `env`, but `realEnv` (the snapshot taken before loading) lacks it.
    const env = { DATABASE_URL: HOSTED, DRIZZLE_ALLOW_REMOTE: '1' };
    expect(() => drizzleDatabaseUrl(env, {}, 'push')).toThrow(/refused/);
    expect(drizzleDatabaseUrl(env, { DRIZZLE_ALLOW_REMOTE: '1' }, 'push')).toBe(HOSTED);
  });

  // The real CLI wiring (argv -> command), with a fake unroutable host in the
  // real environment: push must stop before any connection, generate must not care.
  const run = (command: string) =>
    spawnSync('node_modules/.bin/drizzle-kit', [command], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: HOSTED, DRIZZLE_ALLOW_REMOTE: '' },
      timeout: 60_000,
    });

  it('drizzle-kit push refuses a hosted URL before connecting', () => {
    const result = run('push');
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/refused: DATABASE_URL does not point at this machine/);
  });

  it('drizzle-kit generate still works with a hosted URL set', () => {
    const result = run('generate');
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toMatch(/refused/);
  });
});

describe('LOCAL_DB_TESTS=1 with a non-local database is an error, not a silent skip', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws on import', async () => {
    vi.stubEnv('LOCAL_DB_TESTS', '1');
    vi.stubEnv('DATABASE_URL', HOSTED);
    vi.resetModules();
    await expect(import('./local-db/guard')).rejects.toThrow(/would skip/);
  });

  it('exports localDb=true for a local database', async () => {
    vi.stubEnv('LOCAL_DB_TESTS', '1');
    vi.stubEnv('DATABASE_URL', LOCAL);
    vi.resetModules();
    expect((await import('./local-db/guard')).localDb).toBe(true);
  });
});
