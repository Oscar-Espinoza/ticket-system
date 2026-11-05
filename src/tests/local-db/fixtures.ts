// Fixtures for tests that run against a throwaway local Postgres, either
// directly (node-postgres driver, `pnpm test:db`) or behind the local Neon proxy
// (neon driver, `pnpm test:db:neon`). They never run against Neon: every suite
// is skipped unless LOCAL_DB_TESTS=1 and DATABASE_URL points at this machine.
// See docs/SELF_HOSTING.md → "Database tests".
import { db } from '@/lib/db';
import { projectMembers, projects, users, workflowStates } from '@/db/schema';

export { localDb } from './guard';

const uid = () => crypto.randomUUID();

export async function makeUser(label = 'user') {
  const id = uid();
  const now = new Date();
  await db.insert(users).values({
    id,
    name: label,
    email: `${label}-${id}@test.local`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function makeProject(ownerId: string, key: string, memberIds: string[] = []) {
  const id = uid();
  const now = new Date();
  await db.insert(projects).values({
    id,
    name: key,
    ticketKey: `${key}${id.slice(0, 6)}`.toUpperCase(),
    ownerId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(projectMembers).values(
    [ownerId, ...memberIds].map((userId, i) => ({
      id: uid(),
      projectId: id,
      userId,
      role: i === 0 ? ('owner' as const) : ('member' as const),
      createdAt: now,
    })),
  );
  await db.insert(workflowStates).values(
    (
      [
        ['Backlog', 'backlog'],
        ['Todo', 'unstarted'],
        ['In Progress', 'started'],
        ['Done', 'completed'],
        ['Canceled', 'canceled'],
      ] as const
    ).map(([name, type], i) => ({
      id: uid(),
      projectId: id,
      name,
      type,
      color: '#888888',
      position: i,
      createdAt: now,
    })),
  );
  return id;
}
