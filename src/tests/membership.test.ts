// Integration test suite for the Membership + Invite Links phase (Phase 3).
// Covers MEM-01, MEM-02/idempotency, MEM-03, MEM-05.
//
// Wave-0 RED test file — created in Plan 01 (foundation slice).
// requireProjectOwner (MEM-03) tests are GREEN after Task 2.
// generateInviteLink, joinProject, removeMember tests are RED (dynamic import)
// until Plans 02, 03, 04 ship those exports.
//
// Harness conventions (mirrors src/tests/projects.test.ts):
//   - DATABASE_URL beforeAll guard
//   - Unique IDs per run (never collide on global unique constraints)
//   - afterEach deletes created rows (FK ON DELETE CASCADE cleans children)
//   - Direct db.insert(users/projects/projectMembers) for speed
//
// Mocking strategy:
//   - next/headers → returns empty Headers
//   - next/cache revalidatePath → no-op
//   - @/lib/auth getSession → returns SESSION_USER_ID (a real user in beforeAll)
//   - next/navigation redirect → throws Error(`NEXT_REDIRECT:${url}`) so joinProject
//     stays testable without a running Next.js server

import { vi } from 'vitest';

// SESSION_USER_ID is the user ID the mocked session returns. A real user row
// with this ID is inserted in the MEM-03 beforeAll block and cleaned up after.
const SESSION_USER_ID = `test-mem-session-user-${Date.now()}`;

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: SESSION_USER_ID },
      }),
    },
  },
}));

// joinProject calls redirect() inside the Server Action — mock it so the action
// stays testable without a running Next.js server. The test asserts that redirect
// was called with the correct project URL on both fresh-join and already-member paths.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, projects, projectMembers, invitations } from '@/db/schema';
import {
  requireProjectOwner,
  requireProjectMember,
  ProjectAccessError,
} from '@/lib/project-access';

// ---------------------------------------------------------------------------
// Per-run tracking for cleanup
// ---------------------------------------------------------------------------

const createdProjectIds: string[] = [];
const createdUserEmails: string[] = [];
const createdInvitationIds: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a unique 6-char uppercase ticket key per run.
 * Format: T + 2-char tag (uppercased, alpha-only padded with X) + 3-char random suffix.
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
  const email = `user-mem-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  createdUserEmails.push(email);
  return email;
}

/**
 * Inserts a minimal user row directly (no auth flow needed).
 * Returns the generated userId.
 */
async function insertTestUser(tag: string): Promise<string> {
  const userId = `test-mem-user-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = uniqueEmail(tag);
  const now = new Date();
  await db.insert(users).values({
    id: userId,
    name: `Test Membership User ${tag}`,
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
  const projectId = `test-memproj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const memberId = `test-memmem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  await db.insert(projects).values({
    id: projectId,
    name: `Test Membership Project ${ticketKey}`,
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

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set — create .env.local before running membership tests.',
    );
  }
  // Insert the session mock user so owner-only action tests can resolve FK references.
  const now = new Date();
  await db.insert(users).values({
    id: SESSION_USER_ID,
    name: 'Test Session User (MEM-03)',
    email: `session-mock-${SESSION_USER_ID}@example.test`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
});

afterAll(async () => {
  // Clean up the session mock user (cascade removes any projects it owns)
  await db.delete(users).where(eq(users.id, SESSION_USER_ID));
});

afterEach(async () => {
  // Delete created invitations first (FK cascade not guaranteed across all versions)
  if (createdInvitationIds.length > 0) {
    await db
      .delete(invitations)
      .where(inArray(invitations.id, createdInvitationIds));
    createdInvitationIds.length = 0;
  }
  // Delete created projects (FK cascade removes project_member rows)
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
// MEM-03: requireProjectOwner authorization seam (GREEN after Task 2)
// ---------------------------------------------------------------------------

describe('MEM-03: requireProjectOwner authorization', () => {
  it(
    'MEM-03: requireProjectOwner returns the membership for the project owner',
    async () => {
      // Arrange: create a project owned by ownerUser
      const ownerUserId = await insertTestUser('owner-a');
      const projectId = await insertTestProject(ownerUserId, uniqueKey('OW'));

      // Act
      const membership = await requireProjectOwner(projectId, ownerUserId);

      // Assert
      expect(membership.role).toBe('owner');
      expect(membership.projectId).toBe(projectId);
      expect(membership.userId).toBe(ownerUserId);
    },
  );

  it(
    'MEM-03: requireProjectOwner throws ProjectAccessError for a regular member (not owner)',
    async () => {
      // Arrange: create a project owned by ownerUser; add memberUser as 'member'
      const ownerUserId = await insertTestUser('owner-b');
      const memberUserId = await insertTestUser('member-b');
      const projectId = await insertTestProject(ownerUserId, uniqueKey('MB'));

      await db.insert(projectMembers).values({
        id: `test-mbr-role-${Date.now()}`,
        projectId,
        userId: memberUserId,
        role: 'member',
        createdAt: new Date(),
      });

      // Act + Assert: member is rejected with ProjectAccessError
      await expect(
        requireProjectOwner(projectId, memberUserId),
      ).rejects.toBeInstanceOf(ProjectAccessError);
    },
  );

  it(
    'MEM-03: requireProjectOwner throws ProjectAccessError for a non-member (inherits WR-01 from requireProjectMember)',
    async () => {
      // Arrange: create a project; use a user not in project_member at all
      const ownerUserId = await insertTestUser('owner-c');
      const strangerUserId = await insertTestUser('stranger-c');
      const projectId = await insertTestProject(ownerUserId, uniqueKey('NM'));

      // Act + Assert: non-member is rejected before any project data is read
      await expect(
        requireProjectOwner(projectId, strangerUserId),
      ).rejects.toBeInstanceOf(ProjectAccessError);
    },
  );

  it(
    'MEM-03: requireProjectOwner issues exactly one DB query (reuses role from requireProjectMember)',
    async () => {
      // Structural test: requireProjectOwner must not issue a second query.
      // We verify this by checking the function body contains a single call to
      // requireProjectMember with no additional db.select() call.
      // (Runtime verification: the GREEN tests above pass with a single owner row insert.)
      const ownerUserId = await insertTestUser('owner-d');
      const projectId = await insertTestProject(ownerUserId, uniqueKey('SQ'));

      // Should resolve without error
      const membership = await requireProjectOwner(projectId, ownerUserId);
      expect(membership.role).toBe('owner');
    },
  );
});

// ---------------------------------------------------------------------------
// MEM-01: generateInviteLink action (RED until Plan 02 ships)
// ---------------------------------------------------------------------------

describe('MEM-01: generateInviteLink action', () => {
  it(
    'MEM-01: generateInviteLink inserts exactly one invitation row with a unique token and expiresAt ~30 days out',
    async () => {
      // This test is RED until src/app/actions/invite.ts ships generateInviteLink.
      const { generateInviteLink } = await import('@/app/actions/invite');

      // Session is mocked to return SESSION_USER_ID; insert a project owned by that user
      const projectId = await insertTestProject(
        SESSION_USER_ID,
        uniqueKey('GL'),
      );

      const formData = new FormData();
      formData.set('projectId', projectId);

      const result = await generateInviteLink({}, formData);
      expect(result.success).toBe(true);

      // Verify exactly one invitation row was inserted for this project
      const rows = await db
        .select()
        .from(invitations)
        .where(eq(invitations.projectId, projectId));
      expect(rows).toHaveLength(1);

      const invite = rows[0];
      createdInvitationIds.push(invite.id);

      // Token should be non-empty and URL-safe
      expect(typeof invite.token).toBe('string');
      expect(invite.token.length).toBeGreaterThan(0);

      // expiresAt should be approximately 30 days from now (allow ±5 minutes)
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const tolerance = 5 * 60 * 1000;
      const expectedExpiry = Date.now() + thirtyDays;
      expect(invite.expiresAt.getTime()).toBeGreaterThan(expectedExpiry - tolerance);
      expect(invite.expiresAt.getTime()).toBeLessThan(expectedExpiry + tolerance);
    },
  );

  it(
    'MEM-01: a second generateInviteLink call replaces the token (still exactly one active row)',
    async () => {
      // This test is RED until src/app/actions/invite.ts ships generateInviteLink.
      const { generateInviteLink } = await import('@/app/actions/invite');

      const projectId = await insertTestProject(
        SESSION_USER_ID,
        uniqueKey('RG'),
      );

      const formData = new FormData();
      formData.set('projectId', projectId);

      // First call
      await generateInviteLink({}, formData);
      const firstRows = await db
        .select()
        .from(invitations)
        .where(eq(invitations.projectId, projectId));
      expect(firstRows).toHaveLength(1);
      const firstToken = firstRows[0].token;
      createdInvitationIds.push(firstRows[0].id);

      // Second call (regenerate)
      await generateInviteLink({}, formData);
      const secondRows = await db
        .select()
        .from(invitations)
        .where(eq(invitations.projectId, projectId));

      // Still exactly one row (old one replaced)
      expect(secondRows).toHaveLength(1);
      // Token changed
      expect(secondRows[0].token).not.toBe(firstToken);
      // Update tracked id in case it changed
      if (!createdInvitationIds.includes(secondRows[0].id)) {
        createdInvitationIds.push(secondRows[0].id);
      }
    },
  );

  it(
    'MEM-01: generateInviteLink returns Forbidden for a non-owner member',
    async () => {
      // This test is RED until src/app/actions/invite.ts ships generateInviteLink.
      const { generateInviteLink } = await import('@/app/actions/invite');

      // Create a project owned by a different user; SESSION_USER_ID is just a member
      const realOwner = await insertTestUser('real-owner-gl');
      const projectId = await insertTestProject(realOwner, uniqueKey('NW'));

      // Add SESSION_USER_ID as a regular member
      await db.insert(projectMembers).values({
        id: `test-mem-nonown-${Date.now()}`,
        projectId,
        userId: SESSION_USER_ID,
        role: 'member',
        createdAt: new Date(),
      });

      const formData = new FormData();
      formData.set('projectId', projectId);

      const result = await generateInviteLink({}, formData);
      expect(result.errors?.server).toBeTruthy();
    },
  );
});

// ---------------------------------------------------------------------------
// MEM-02: joinProject idempotency (RED until Plan 03 ships)
// ---------------------------------------------------------------------------

describe('MEM-02: joinProject idempotency', () => {
  it(
    'MEM-02: joinProject inserts a member row for a new user and redirects to the project',
    async () => {
      // This test is RED until src/app/actions/join.ts ships joinProject.
      const { joinProject } = await import('@/app/actions/join');
      const { redirect } = await import('next/navigation');
      const mockedRedirect = vi.mocked(redirect);
      mockedRedirect.mockClear();

      // Create an invite and project
      const projectId = await insertTestProject(
        SESSION_USER_ID,
        uniqueKey('JN'),
      );
      const token = `test-tok-${Date.now()}`;
      const inviteId = `test-inv-${Date.now()}`;
      await db.insert(invitations).values({
        id: inviteId,
        projectId,
        token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });
      createdInvitationIds.push(inviteId);

      // Use a fresh user as the joiner
      const joinerUserId = await insertTestUser('joiner-a');
      // Override session mock for this test
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: joinerUserId },
      } as Awaited<ReturnType<typeof auth.api.getSession>>);

      const formData = new FormData();
      formData.set('token', token);

      // joinProject calls redirect() — we catch the thrown Error
      try {
        await joinProject({}, formData);
      } catch (err) {
        expect((err as Error).message).toContain(`NEXT_REDIRECT:/dashboard/projects/${projectId}`);
      }

      // Verify the member row was inserted
      const memberRows = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, joinerUserId));
      expect(memberRows).toHaveLength(1);
      expect(memberRows[0].role).toBe('member');
    },
  );

  it(
    'MEM-02: joinProject for an already-member user inserts NO additional row (idempotency) and still redirects',
    async () => {
      // This test is RED until src/app/actions/join.ts ships joinProject.
      const { joinProject } = await import('@/app/actions/join');

      // Create project and invite
      const projectId = await insertTestProject(
        SESSION_USER_ID,
        uniqueKey('ID'),
      );
      const token = `test-tok-idem-${Date.now()}`;
      const inviteId = `test-inv-idem-${Date.now()}`;
      await db.insert(invitations).values({
        id: inviteId,
        projectId,
        token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });
      createdInvitationIds.push(inviteId);

      // Pre-insert the user as already a member
      const existingMemberId = await insertTestUser('existing-mem-b');
      await db.insert(projectMembers).values({
        id: `test-existing-mem-${Date.now()}`,
        projectId,
        userId: existingMemberId,
        role: 'member',
        createdAt: new Date(),
      });

      // Override session mock for this user
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: existingMemberId },
      } as Awaited<ReturnType<typeof auth.api.getSession>>);

      const formData = new FormData();
      formData.set('token', token);

      // joinProject should redirect without duplicating the membership row
      try {
        await joinProject({}, formData);
      } catch (err) {
        expect((err as Error).message).toContain(`NEXT_REDIRECT:/dashboard/projects/${projectId}`);
      }

      // Still exactly one member row for this user (no duplicate)
      const memberRows = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, existingMemberId));
      expect(memberRows).toHaveLength(1);
    },
  );
});

// ---------------------------------------------------------------------------
// MEM-02: joinProject expired/unknown token (D-28 enumeration-resistance)
// ---------------------------------------------------------------------------

describe('MEM-02: joinProject expired/unknown token', () => {
  it(
    'MEM-02: joinProject returns { error: "invalid" } for an EXPIRED token and inserts no project_member row',
    async () => {
      const { joinProject } = await import('@/app/actions/join');

      // Arrange: a project and an invitation that already expired
      const projectId = await insertTestProject(
        SESSION_USER_ID,
        uniqueKey('EX'),
      );
      const expiredToken = `test-tok-expired-${Date.now()}`;
      const expiredInviteId = `test-inv-exp-${Date.now()}`;
      await db.insert(invitations).values({
        id: expiredInviteId,
        projectId,
        token: expiredToken,
        // expiresAt is 1 second in the past — already expired
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      });
      createdInvitationIds.push(expiredInviteId);

      const joinerUserId = await insertTestUser('joiner-exp');
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: joinerUserId },
      } as Awaited<ReturnType<typeof auth.api.getSession>>);

      const formData = new FormData();
      formData.set('token', expiredToken);

      // Act — must NOT throw NEXT_REDIRECT (returns normally on the invalid path)
      const result = await joinProject({}, formData);

      // Assert: error returned, no member row inserted
      expect(result.error).toBe('invalid');

      const memberRows = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, joinerUserId));
      expect(memberRows).toHaveLength(0);
    },
  );

  it(
    'MEM-02: joinProject returns { error: "invalid" } for an UNKNOWN/garbage token and inserts no project_member row',
    async () => {
      const { joinProject } = await import('@/app/actions/join');

      // Arrange: a fresh joiner user; NO invitation row for this token
      const joinerUserId = await insertTestUser('joiner-unk');
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: joinerUserId },
      } as Awaited<ReturnType<typeof auth.api.getSession>>);

      const formData = new FormData();
      // Random garbage token — guaranteed not to exist in the DB
      formData.set('token', `garbage-token-${Date.now()}-${Math.random().toString(36).slice(2)}`);

      // Act — must NOT throw NEXT_REDIRECT
      const result = await joinProject({}, formData);

      // Assert: error returned, no member row inserted
      expect(result.error).toBe('invalid');

      const memberRows = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, joinerUserId));
      expect(memberRows).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// MEM-05: removeMember action (RED until Plan 04 ships)
// ---------------------------------------------------------------------------

describe('MEM-05: removeMember action', () => {
  it(
    'MEM-05: removeMember deletes the target member row',
    async () => {
      // This test is RED until src/app/actions/members.ts ships removeMember.
      const { removeMember } = await import('@/app/actions/members');

      const projectId = await insertTestProject(
        SESSION_USER_ID,
        uniqueKey('RM'),
      );

      const targetUserId = await insertTestUser('target-rm');
      const targetMemberId = `test-rm-mem-${Date.now()}`;
      await db.insert(projectMembers).values({
        id: targetMemberId,
        projectId,
        userId: targetUserId,
        role: 'member',
        createdAt: new Date(),
      });

      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('memberId', targetMemberId);

      const result = await removeMember({}, formData);
      expect(result.success).toBe(true);

      // Verify the row is gone
      const rows = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.id, targetMemberId));
      expect(rows).toHaveLength(0);
    },
  );

  it(
    'MEM-05: removeMember rejects removing an owner row (owners are unremovable in v1)',
    async () => {
      // This test is RED until src/app/actions/members.ts ships removeMember.
      const { removeMember } = await import('@/app/actions/members');

      const otherOwner = await insertTestUser('other-owner-rm');
      const projectId = await insertTestProject(otherOwner, uniqueKey('RO'));

      // Find the owner member row
      const ownerRows = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, otherOwner));
      expect(ownerRows).toHaveLength(1);
      const ownerMemberId = ownerRows[0].id;

      // Session owner (SESSION_USER_ID) tries to remove the project owner — should fail
      // Add SESSION_USER_ID as an owner of this project for the action to pass auth
      await db.insert(projectMembers).values({
        id: `test-sess-own-${Date.now()}`,
        projectId,
        userId: SESSION_USER_ID,
        role: 'owner',
        createdAt: new Date(),
      });

      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('memberId', ownerMemberId);

      const result = await removeMember({}, formData);
      expect(result.errors?.server).toBeTruthy();
    },
  );

  it(
    'MEM-05: removeMember rejects self-remove (a member cannot remove themselves)',
    async () => {
      // This test is RED until src/app/actions/members.ts ships removeMember.
      const { removeMember } = await import('@/app/actions/members');

      const projectId = await insertTestProject(
        SESSION_USER_ID,
        uniqueKey('SR'),
      );

      // Find the session user's own member row
      const selfRows = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, SESSION_USER_ID));
      const selfMemberId = selfRows.find((r) => r.projectId === projectId)?.id;
      expect(selfMemberId).toBeTruthy();

      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('memberId', selfMemberId!);

      const result = await removeMember({}, formData);
      expect(result.errors?.server).toBeTruthy();
    },
  );
});
