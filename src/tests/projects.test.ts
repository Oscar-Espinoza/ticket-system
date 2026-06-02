// Integration test suite for the Projects + Authorization Layer (Phase 2).
// Covers PROJ-01, PROJ-02, PROJ-03, MEM-06.
//
// This is the Wave 0 test file — it references exports that do not yet exist
// (createProject, getProjectsForUser) so the full suite is RED until Plans 02/03
// land their exports. The MEM-06 tests targeting requireProjectMember go GREEN
// after Plan 01 Task 3 lands src/lib/project-access.ts.
//
// Harness conventions (mirrors src/tests/auth.test.ts):
//   - DATABASE_URL beforeAll guard
//   - Unique IDs per run (never collide on global unique constraints)
//   - afterEach deletes created rows (FK ON DELETE CASCADE cleans project_member + ticket)
//   - Direct db.insert(users) for speed; auth flow only when a real session is needed

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, projects, projectMembers } from '@/db/schema';
import { requireProjectMember, ProjectAccessError } from '@/lib/project-access';
// createProject and getProjectsForUser are created in later plans (Plans 02/03).
// They are imported dynamically inside the test bodies so their absence causes
// those specific tests to fail (RED) without preventing the MEM-06 tests from
// running at all. Static top-level imports would break the entire file at parse
// time, making it impossible to verify the MEM-06 GREEN state in Plan 01 Task 3.

// ---------------------------------------------------------------------------
// Per-run tracking for cleanup
// ---------------------------------------------------------------------------

const createdProjectIds: string[] = [];
const createdUserEmails: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a unique 6-char uppercase ticket key per run.
 * Format: T + 2-char tag (uppercased, alpha-only padded with X) + 3-char random suffix.
 * Stays within /^[A-Z]{2,6}$/ constraint.
 */
function uniqueKey(tag: string): string {
  const tagPart = tag
    .toUpperCase()
    .replace(/[^A-Z]/g, 'X')
    .slice(0, 2)
    .padEnd(2, 'X');
  const suffix = Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()
    .replace(/[^A-Z]/g, 'X')
    .padEnd(3, 'X');
  return `T${tagPart}${suffix}`.slice(0, 6);
}

/** Creates a unique test user email and tracks it for cleanup. */
function uniqueEmail(tag: string): string {
  const email = `user-proj-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  createdUserEmails.push(email);
  return email;
}

/**
 * Inserts a minimal user row directly (no auth flow needed for non-auth tests).
 * Returns the generated userId.
 */
async function insertTestUser(tag: string): Promise<string> {
  const userId = `test-proj-user-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = uniqueEmail(tag);
  const now = new Date();
  await db.insert(users).values({
    id: userId,
    name: `Test Project User ${tag}`,
    email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  return userId;
}

/**
 * Inserts a project row and an owner project_member row directly.
 * Tracks the projectId for cleanup.
 */
async function insertTestProject(
  ownerId: string,
  ticketKey: string,
): Promise<string> {
  const projectId = `test-proj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const memberId = `test-mem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  await db.insert(projects).values({
    id: projectId,
    name: `Test Project ${ticketKey}`,
    ticketKey,
    ticketCounter: 0,
    ownerId,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(projectMembers).values({
    id: memberId,
    projectId,
    userId: ownerId,
    role: 'owner',
    createdAt: now,
  });

  createdProjectIds.push(projectId);
  return projectId;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set — create .env.local before running project tests.',
    );
  }
});

afterEach(async () => {
  // Delete created projects (FK cascade removes project_member + ticket rows)
  if (createdProjectIds.length > 0) {
    await db
      .delete(projects)
      .where(inArray(projects.id, createdProjectIds));
    createdProjectIds.length = 0;
  }
  // Delete created test users (FK cascade removes sessions + accounts)
  if (createdUserEmails.length > 0) {
    await db
      .delete(users)
      .where(inArray(users.email, createdUserEmails));
    createdUserEmails.length = 0;
  }
});

// ---------------------------------------------------------------------------
// MEM-06: requireProjectMember authorization boundary
// ---------------------------------------------------------------------------

describe('MEM-06: requireProjectMember authorization', () => {
  it(
    'MEM-06: requireProjectMember rejects a non-member before any project SELECT runs',
    async () => {
      // Arrange: create a project owned by userA; userB is not a member
      const ownerUserId = await insertTestUser('owner-a');
      const nonMemberUserId = await insertTestUser('nonmember-b');
      const projectId = await insertTestProject(ownerUserId, uniqueKey('NM'));

      // Act + Assert: non-member is rejected with ProjectAccessError
      await expect(
        requireProjectMember(projectId, nonMemberUserId),
      ).rejects.toBeInstanceOf(ProjectAccessError);
    },
  );

  it(
    'MEM-06: requireProjectMember accepts a member (not owner) and returns role === "member"',
    async () => {
      // Arrange: create a project owned by userA; add userB as a regular member
      const ownerUserId = await insertTestUser('owner-c');
      const memberUserId = await insertTestUser('member-d');
      const projectId = await insertTestProject(ownerUserId, uniqueKey('MB'));

      // Seed a 'member' row for userB
      await db.insert(projectMembers).values({
        id: `test-mem-role-${Date.now()}`,
        projectId,
        userId: memberUserId,
        role: 'member',
        createdAt: new Date(),
      });

      // Act
      const membership = await requireProjectMember(projectId, memberUserId);

      // Assert
      expect(membership.role).toBe('member');
      expect(membership.projectId).toBe(projectId);
      expect(membership.userId).toBe(memberUserId);
    },
  );

  it(
    'MEM-06: requireProjectMember accepts an owner and returns role === "owner"',
    async () => {
      // Arrange: create a project owned by userA
      const ownerUserId = await insertTestUser('owner-e');
      const projectId = await insertTestProject(ownerUserId, uniqueKey('OW'));

      // Act
      const membership = await requireProjectMember(projectId, ownerUserId);

      // Assert
      expect(membership.role).toBe('owner');
      expect(membership.projectId).toBe(projectId);
      expect(membership.userId).toBe(ownerUserId);
    },
  );
});

// ---------------------------------------------------------------------------
// PROJ-03: non-member access to project detail
// ---------------------------------------------------------------------------

describe('PROJ-03: project detail access control', () => {
  it(
    'PROJ-03: a non-member calling requireProjectMember for a foreign project is rejected (maps to notFound() on detail page)',
    async () => {
      // Arrange: create a project; use a completely separate user as non-member
      const ownerUserId = await insertTestUser('owner-f');
      const nonMemberUserId = await insertTestUser('stranger-g');
      const projectId = await insertTestProject(ownerUserId, uniqueKey('P3'));

      // Act + Assert: ProjectAccessError thrown before any project SELECT runs
      await expect(
        requireProjectMember(projectId, nonMemberUserId),
      ).rejects.toBeInstanceOf(ProjectAccessError);
    },
  );
});

// ---------------------------------------------------------------------------
// PROJ-01: createProject action (these will be RED until Plan 02 ships)
// ---------------------------------------------------------------------------

describe('PROJ-01: createProject action', () => {
  it(
    'PROJ-01: createProject inserts both a project row and a project_member row with role "owner" for the creator',
    async () => {
      // This test is RED until src/app/actions/projects.ts is created in Plan 02.
      // When green: both a project row and an owner project_member row must exist.
      const { createProject } = await import('@/app/actions/projects');
      const ticketKey = uniqueKey('CR');

      // createProject accepts (prevState, formData); simulate with FormData
      const formData = new FormData();
      formData.set('name', 'Test Project Create');
      formData.set('ticketKey', ticketKey);

      // Note: this test requires a real session which createProject reads via
      // auth.api.getSession({ headers: await headers() }). In the Wave 0 context
      // this test will fail because the module doesn't exist yet.
      const result = await createProject({}, formData);

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();

      // Verify both rows exist in the DB
      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.ticketKey, ticketKey))
        .limit(1);
      expect(projectRows).toHaveLength(1);
      const projectId = projectRows[0].id;
      createdProjectIds.push(projectId);

      const memberRows = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, projectId))
        .limit(1);
      expect(memberRows).toHaveLength(1);
      expect(memberRows[0].role).toBe('owner');
    },
  );

  it(
    'PROJ-01: createProject with a duplicate ticketKey returns a field-level error on errors.ticketKey (no throw / no crash)',
    async () => {
      // This test is RED until src/app/actions/projects.ts is created in Plan 02.
      const { createProject } = await import('@/app/actions/projects');
      const ticketKey = uniqueKey('DU');

      const formData1 = new FormData();
      formData1.set('name', 'First Project');
      formData1.set('ticketKey', ticketKey);

      const formData2 = new FormData();
      formData2.set('name', 'Duplicate Key Project');
      formData2.set('ticketKey', ticketKey);

      // First create succeeds
      const result1 = await createProject({}, formData1);
      expect(result1.success).toBe(true);

      // Second create with same key must return a field error, not throw
      const result2 = await createProject({}, formData2);
      expect(result2.errors?.ticketKey).toBeTruthy();
      expect(result2.success).not.toBe(true);
    },
  );

  it(
    'PROJ-01: createProject with an invalid ticketKey (too short, too long, or non-alpha) returns errors.ticketKey and performs NO project insert',
    async () => {
      // This test is RED until src/app/actions/projects.ts is created in Plan 02.
      const { createProject } = await import('@/app/actions/projects');
      // Tests multiple invalid keys: 'a' (too short), '1' (non-alpha), 'TOOLONGKEY' (too long)
      const invalidKeys = ['a', '1', 'TOOLONGKEY'];

      for (const invalidKey of invalidKeys) {
        const formData = new FormData();
        formData.set('name', 'Invalid Key Project');
        formData.set('ticketKey', invalidKey);

        const result = await createProject({}, formData);
        expect(
          result.errors?.ticketKey,
          `Expected ticketKey error for key: "${invalidKey}"`,
        ).toBeTruthy();
        expect(result.success).not.toBe(true);

        // No project row should have been inserted
        const rows = await db
          .select()
          .from(projects)
          .where(eq(projects.ticketKey, invalidKey))
          .limit(1);
        expect(rows).toHaveLength(0);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// PROJ-02: getProjectsForUser query (RED until Plan 03 ships)
// ---------------------------------------------------------------------------

describe('PROJ-02: getProjectsForUser query', () => {
  it(
    'PROJ-02: getProjectsForUser returns a project the user owns AND a project the user is only a member of',
    async () => {
      // This test is RED until src/components/project-list.tsx is created in Plan 03.
      const { getProjectsForUser } = await import('@/components/project-list');
      const userId = await insertTestUser('list-user-h');

      // Create a project they own
      const ownedProjectId = await insertTestProject(
        userId,
        uniqueKey('OW'),
      );

      // Create a project owned by someone else; add userId as a 'member'
      const otherOwnerId = await insertTestUser('other-owner-i');
      const memberProjectId = await insertTestProject(
        otherOwnerId,
        uniqueKey('ME'),
      );
      await db.insert(projectMembers).values({
        id: `test-memship-${Date.now()}`,
        projectId: memberProjectId,
        userId,
        role: 'member',
        createdAt: new Date(),
      });

      const userProjects = await getProjectsForUser(userId);

      const projectIds = userProjects.map((p) => p.id);
      expect(projectIds).toContain(ownedProjectId);
      expect(projectIds).toContain(memberProjectId);
    },
  );

  it(
    'PROJ-02: a project with no tickets reports openCount === 0 and resolvedCount === 0 (numbers, not strings)',
    async () => {
      // This test is RED until src/components/project-list.tsx is created in Plan 03.
      const { getProjectsForUser } = await import('@/components/project-list');
      const userId = await insertTestUser('count-user-j');
      await insertTestProject(userId, uniqueKey('ZR'));

      const userProjects = await getProjectsForUser(userId);

      expect(userProjects.length).toBeGreaterThan(0);
      const project = userProjects[0];
      expect(typeof project.openCount).toBe('number');
      expect(typeof project.resolvedCount).toBe('number');
      expect(project.openCount).toBe(0);
      expect(project.resolvedCount).toBe(0);
    },
  );
});
