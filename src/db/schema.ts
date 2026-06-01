// Drizzle schema — all 7 logical tables for the ticket system.
//
// Better Auth core tables (user, session, account, verification) use SINGULAR
// table names as required by Better Auth defaults. App-domain tables
// (project, project_member, invitation, ticket) are hand-written per D-06.
//
// Sources:
//   - Better Auth core tables: https://www.better-auth.com/docs/concepts/database
//   - App-domain tables: D-06, D-07, D-08 from 01-CONTEXT.md

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  unique,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Better Auth core tables
// ---------------------------------------------------------------------------

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

// ---------------------------------------------------------------------------
// App-domain tables (D-06 / D-07 / D-08)
// ---------------------------------------------------------------------------

// D-07: ticket status enum is locked to exactly these five values.
export const ticketStatusEnum = pgEnum('ticket_status', [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
]);

export const projects = pgTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ticketKey: text('ticket_key').notNull().unique(), // e.g. "APP"
  ticketCounter: integer('ticket_counter').notNull().default(0),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  githubRepo: text('github_repo'), // Phase 4/7 — nullable now
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const projectMembers = pgTable('project_member', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const invitations = pgTable('invitation', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const tickets = pgTable(
  'ticket',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ticketNumber: integer('ticket_number').notNull(), // per-project sequential number
    title: text('title').notNull(),
    description: text('description'),
    status: ticketStatusEnum('status').notNull().default('backlog'),
    assigneeId: text('assignee_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    githubBranch: text('github_branch'), // Phase 7 — nullable now
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => ({
    // D-08: per-project ticket-number uniqueness enforced at schema level.
    uniqueProjectTicket: unique().on(table.projectId, table.ticketNumber),
  }),
);
