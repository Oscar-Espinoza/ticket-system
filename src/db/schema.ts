// Drizzle schema for the ticket system.
//
// Better Auth core tables (user, session, account, verification) use SINGULAR
// table names as required by Better Auth defaults. App-domain tables are
// hand-written. This app's "project" is what Linear calls a team (it owns the
// issue key, members and workflow); Linear's "projects" are called epics here.
//
// Sources:
//   - Better Auth core tables: https://www.better-auth.com/docs/concepts/database
//   - App-domain tables: D-06, D-07, D-08 from 01-CONTEXT.md
//   - Linear-parity tables: .planning/features/00-MASTER-PLAN.md

import {
  type AnyPgColumn,
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  date,
  jsonb,
  pgEnum,
  primaryKey,
  unique,
  index,
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
  /** Better Auth twoFactor plugin. */
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
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
// Enums
// ---------------------------------------------------------------------------

// Linear's workflow state categories. Every custom state belongs to one.
export const workflowStateTypeEnum = pgEnum('workflow_state_type', [
  'triage',
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
]);

export const issuePriorityEnum = pgEnum('issue_priority', [
  'none',
  'urgent',
  'high',
  'medium',
  'low',
]);

// "blocked by" is the inverse of "blocks"; "duplicate" means ticket duplicates related.
export const issueRelationTypeEnum = pgEnum('issue_relation_type', [
  'blocks',
  'related',
  'duplicate',
]);

export const epicStatusEnum = pgEnum('epic_status', [
  'backlog',
  'planned',
  'started',
  'paused',
  'completed',
  'canceled',
]);

export const healthEnum = pgEnum('health', ['on_track', 'at_risk', 'off_track']);

export const attachmentKindEnum = pgEnum('attachment_kind', ['file', 'link']);

// ---------------------------------------------------------------------------
// Workspaces (optional grouping of projects/teams)
// ---------------------------------------------------------------------------

export const workspaces = pgTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const workspaceMembers = pgTable(
  'workspace_member',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.userId)],
);

export const workspaceInvitations = pgTable(
  'workspace_invitation',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
    token: text('token').notNull().unique(),
    invitedById: text('invited_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptedAt: timestamp('accepted_at'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('workspace_invitation_workspace_idx').on(table.workspaceId)],
);

// ---------------------------------------------------------------------------
// Projects (Linear "teams")
// ---------------------------------------------------------------------------

export const projects = pgTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ticketKey: text('ticket_key').notNull().unique(), // e.g. "APP"
  ticketCounter: integer('ticket_counter').notNull().default(0),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  description: text('description'),
  icon: text('icon'),
  color: text('color'),
  workspaceId: text('workspace_id').references(() => workspaces.id, {
    onDelete: 'set null',
  }),
  /** Sub-team: parent project (team) in the same workspace. */
  parentId: text('parent_id').references((): AnyPgColumn => projects.id, {
    onDelete: 'set null',
  }),
  /** 'private' = members only; 'workspace' = discoverable/joinable by workspace members. */
  visibility: text('visibility').notNull().default('private'),

  // Planning
  cyclesEnabled: boolean('cycles_enabled').notNull().default(false),
  cycleDurationWeeks: integer('cycle_duration_weeks').notNull().default(2),
  cycleAutoCreate: boolean('cycle_auto_create').notNull().default(true),
  /** 0 = Sunday … 6 = Saturday (Date#getUTCDay). */
  cycleStartWeekday: integer('cycle_start_weekday').notNull().default(1),
  /** Move unfinished issues into the next cycle when a cycle auto-completes. */
  cycleAutoRollover: boolean('cycle_auto_rollover').notNull().default(true),
  /** Weeks of cooldown between cycles (0 = back-to-back). */
  cycleCooldownWeeks: integer('cycle_cooldown_weeks').notNull().default(0),
  /** SLA hours per priority, e.g. { urgent: 24, high: 72 }; empty = SLAs off. */
  slaPolicy: jsonb('sla_policy').$type<Record<string, number>>().notNull().default({}),
  /** 'none' | 'linear' | 'fibonacci' | 'exponential' | 'tshirt' */
  estimateScale: text('estimate_scale').notNull().default('none'),
  triageEnabled: boolean('triage_enabled').notNull().default(false),

  // Automations (run lazily, at most once a day — no cron on the free tier)
  autoArchiveMonths: integer('auto_archive_months').default(6), // null = off
  autoCloseMonths: integer('auto_close_months'), // null = off
  automationRunAt: timestamp('automation_run_at'),

  // Intake form + integrations
  intakeToken: text('intake_token').unique(),
  slackWebhookUrl: text('slack_webhook_url'),
  /** Slack event kinds to post (see SLACK_EVENTS); null = all. */
  slackEvents: jsonb('slack_events').$type<string[]>(),

  // GitHub
  githubRepo: text('github_repo'), // "owner/name"
  githubWebhookId: text('github_webhook_id'),
  githubWebhookSecret: text('github_webhook_secret'),
  githubConnectedById: text('github_connected_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  githubPrOpenStateId: text('github_pr_open_state_id'),
  githubPrMergeStateId: text('github_pr_merge_state_id'),

  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const projectMembers = pgTable(
  'project_member',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member', 'guest'] }).notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => ({
    // D-29: race-safe idempotency backstop — concurrent double-join raises 23505.
    uniqueProjectMember: unique().on(table.projectId, table.userId),
  }),
);

export const invitations = pgTable('invitation', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  /** Set for email invitations; null for shareable links. */
  email: text('email'),
  role: text('role', { enum: ['admin', 'member', 'guest'] })
    .notNull()
    .default('member'),
  invitedById: text('invited_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  acceptedAt: timestamp('accepted_at'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const workflowStates = pgTable(
  'workflow_state',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: workflowStateTypeEnum('type').notNull(),
    color: text('color').notNull(),
    description: text('description'),
    position: doublePrecision('position').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    unique().on(table.projectId, table.name),
    index('workflow_state_project_idx').on(table.projectId),
  ],
);

export const labels = pgTable(
  'label',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [unique().on(table.projectId, table.name)],
);

// ---------------------------------------------------------------------------
// Planning: cycles, initiatives, epics (Linear projects), milestones
// ---------------------------------------------------------------------------

export const cycles = pgTable(
  'cycle',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    name: text('name'),
    description: text('description'),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [unique().on(table.projectId, table.number)],
);

export const initiatives = pgTable('initiative', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  /** 'planned' | 'active' | 'completed' */
  status: text('status').notNull().default('planned'),
  targetDate: date('target_date', { mode: 'string' }),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const epics = pgTable(
  'epic',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    icon: text('icon'),
    status: epicStatusEnum('status').notNull().default('planned'),
    health: healthEnum('health'),
    leadId: text('lead_id').references(() => users.id, { onDelete: 'set null' }),
    startDate: date('start_date', { mode: 'string' }),
    targetDate: date('target_date', { mode: 'string' }),
    initiativeId: text('initiative_id').references(() => initiatives.id, {
      onDelete: 'set null',
    }),
    sortOrder: doublePrecision('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('epic_project_idx').on(table.projectId)],
);

export const milestones = pgTable('milestone', {
  id: text('id').primaryKey(),
  epicId: text('epic_id')
    .notNull()
    .references(() => epics.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  targetDate: date('target_date', { mode: 'string' }),
  sortOrder: doublePrecision('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull(),
});

export const epicUpdates = pgTable('epic_update', {
  id: text('id').primaryKey(),
  epicId: text('epic_id')
    .notNull()
    .references(() => epics.id, { onDelete: 'cascade' }),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  health: healthEnum('health').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

// ---------------------------------------------------------------------------
// Tickets (issues)
// ---------------------------------------------------------------------------

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
    stateId: text('state_id')
      .notNull()
      .references(() => workflowStates.id, { onDelete: 'restrict' }),
    priority: issuePriorityEnum('priority').notNull().default('none'),
    estimate: integer('estimate'),
    /** Planned start (issue timeline view). */
    startDate: date('start_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),
    /** SLA deadline, set from project.slaPolicy when priority/creation qualifies. */
    slaDueAt: timestamp('sla_due_at'),
    slaBreachedAt: timestamp('sla_breached_at'),
    /** Last state change — "time in status". */
    stateChangedAt: timestamp('state_changed_at'),
    assigneeId: text('assignee_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    creatorId: text('creator_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    parentId: text('parent_id').references((): AnyPgColumn => tickets.id, {
      onDelete: 'set null',
    }),
    /** Manual order within a group; lower sorts first. */
    sortOrder: doublePrecision('sort_order').notNull().default(0),
    cycleId: text('cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
    epicId: text('epic_id').references(() => epics.id, { onDelete: 'set null' }),
    milestoneId: text('milestone_id').references(() => milestones.id, {
      onDelete: 'set null',
    }),
    githubBranch: text('github_branch'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    canceledAt: timestamp('canceled_at'),
    archivedAt: timestamp('archived_at'),
    /** Soft delete (trash); restorable until purged. */
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => ({
    // D-08: per-project ticket-number uniqueness enforced at schema level.
    uniqueProjectTicket: unique().on(table.projectId, table.ticketNumber),
    projectIdx: index('ticket_project_idx').on(table.projectId),
    parentIdx: index('ticket_parent_idx').on(table.parentId),
    assigneeIdx: index('ticket_assignee_idx').on(table.assigneeId),
    cycleIdx: index('ticket_cycle_idx').on(table.cycleId),
    epicIdx: index('ticket_epic_idx').on(table.epicId),
  }),
);

export const issueLabels = pgTable(
  'issue_label',
  {
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.ticketId, table.labelId] }),
    index('issue_label_label_idx').on(table.labelId),
  ],
);

export const issueRelations = pgTable(
  'issue_relation',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    relatedTicketId: text('related_ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    type: issueRelationTypeEnum('type').notNull(),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    unique().on(table.ticketId, table.relatedTicketId, table.type),
    index('issue_relation_related_idx').on(table.relatedTicketId),
  ],
);

export const issueSubscribers = pgTable(
  'issue_subscriber',
  {
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.ticketId, table.userId] })],
);

export const comments = pgTable(
  'comment',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** Thread root; null for top-level comments. */
    parentId: text('parent_id').references((): AnyPgColumn => comments.id, {
      onDelete: 'cascade',
    }),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('comment_ticket_idx').on(table.ticketId, table.createdAt)],
);

export const commentReactions = pgTable(
  'comment_reaction',
  {
    id: text('id').primaryKey(),
    commentId: text('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [unique().on(table.commentId, table.userId, table.emoji)],
);

export const attachments = pgTable(
  'attachment',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    uploaderId: text('uploader_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    kind: attachmentKindEnum('kind').notNull(),
    title: text('title').notNull(),
    /** External URL for links; null for uploaded files (served by route). */
    url: text('url'),
    contentType: text('content_type'),
    size: integer('size'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('attachment_ticket_idx').on(table.ticketId)],
);

// Uploaded file bytes live apart from metadata so listings never load them.
export const attachmentBlobs = pgTable('attachment_blob', {
  attachmentId: text('attachment_id')
    .primaryKey()
    .references(() => attachments.id, { onDelete: 'cascade' }),
  dataBase64: text('data_base64').notNull(),
});

// Audit log / issue history. `ticketId` null = project-level event.
export const activities = pgTable(
  'activity',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    /** null = system / integration (GitHub, automation). */
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('activity_ticket_idx').on(table.ticketId, table.createdAt),
    index('activity_project_idx').on(table.projectId, table.createdAt),
  ],
);

export const githubPullRequests = pgTable(
  'github_pull_request',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    /** 'open' | 'closed' | 'merged' */
    state: text('state').notNull(),
    draft: boolean('draft').notNull().default(false),
    branch: text('branch'),
    authorLogin: text('author_login'),
    /** 'github' | 'gitlab' | 'bitbucket' */
    provider: text('provider').notNull().default('github'),
    /** 'approved' | 'changes_requested' | 'review_required' | null */
    reviewDecision: text('review_decision'),
    /** 'pending' | 'success' | 'failure' | null — combined CI status. */
    checksState: text('checks_state'),
    mergedAt: timestamp('merged_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [unique().on(table.ticketId, table.repo, table.number)],
);

export const customerRequests = pgTable('customer_request', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  customerId: text('customer_id').references((): AnyPgColumn => customers.id, {
    onDelete: 'set null',
  }),
  /** 'low' | 'medium' | 'high' | 'critical' */
  importance: text('importance'),
  /** 'intake' | 'slack' | 'manual' | 'api' */
  source: text('source').notNull().default('intake'),
  name: text('name'),
  email: text('email'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const issueTemplates = pgTable('issue_template', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  title: text('title').notNull().default(''),
  description: text('description'),
  /** Default property values: { priority, labelIds, stateId, estimate, assigneeId }. */
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdById: text('created_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const issueDrafts = pgTable('issue_draft', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  description: text('description'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

// ---------------------------------------------------------------------------
// Per-user: notifications, views, favorites, profile, presence, API keys
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  'notification',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp('read_at'),
    /** Hidden from the inbox until this time (snooze and reminders). */
    snoozedUntil: timestamp('snoozed_until'),
    archivedAt: timestamp('archived_at'),
    emailedAt: timestamp('emailed_at'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('notification_user_idx').on(table.userId, table.createdAt)],
);

export const savedViews = pgTable('saved_view', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** null = cross-project view (e.g. built on My Issues). */
  projectId: text('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  display: jsonb('display').$type<Record<string, unknown>>().notNull().default({}),
  /** Visible to every project member (projectId required). */
  shared: boolean('shared').notNull().default(false),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const favorites = pgTable(
  'favorite',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'project' | 'issue' | 'view' | 'epic' | 'cycle' | 'initiative' */
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    sortOrder: doublePrecision('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [unique().on(table.userId, table.targetType, table.targetId)],
);

export const userProfiles = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  bio: text('bio'),
  timezone: text('timezone'),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  /** Per-type toggles, e.g. { assigned: true, mentioned: true, statusChanged: false }. */
  notificationPrefs: jsonb('notification_prefs')
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  /** Email digest: 'off' | 'daily' | 'weekly'. */
  digestFrequency: text('digest_frequency').notNull().default('off'),
  lastDigestAt: timestamp('last_digest_at'),
  pushNotifications: boolean('push_notifications').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const presence = pgTable(
  'presence',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    lastSeenAt: timestamp('last_seen_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.projectId] })],
);

export const apiKeys = pgTable('api_key', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** First characters of the key, shown in the UI to tell keys apart. */
  prefix: text('prefix').notNull(),
  /** sha256 hex of the full key; the key itself is shown once and never stored. */
  keyHash: text('key_hash').notNull().unique(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull(),
});

export const webhooks = pgTable('webhook', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  /** Event types to deliver, e.g. ['issue.created', 'issue.updated']; empty = all. */
  events: jsonb('events').$type<string[]>().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdById: text('created_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  lastStatus: integer('last_status'),
  lastDeliveredAt: timestamp('last_delivered_at'),
  createdAt: timestamp('created_at').notNull(),
});

// ---------------------------------------------------------------------------
// Better Auth plugins (twoFactor, jwt, sso, scim, oauth-provider). Property
// names must match Better Auth field names — the adapter maps by key.
// ---------------------------------------------------------------------------

export const twoFactors = pgTable('two_factor', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  verified: boolean('verified').default(true),
  failedVerificationCount: integer('failed_verification_count').default(0),
  lockedUntil: timestamp('locked_until'),
});

export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at').notNull(),
  expiresAt: timestamp('expires_at'),
});

export const ssoProviders = pgTable('sso_provider', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull(),
  oidcConfig: text('oidc_config'),
  samlConfig: text('saml_config'),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull().unique(),
  /** Unused (no organization plugin); workspace link lives in workspaceSso. */
  organizationId: text('organization_id'),
  domain: text('domain').notNull(),
});

export const scimProviders = pgTable('scim_provider', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().unique(),
  scimToken: text('scim_token').notNull().unique(),
  organizationId: text('organization_id'),
});

export const oauthClients = pgTable('oauth_client', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  clientSecret: text('client_secret'),
  disabled: boolean('disabled').default(false),
  skipConsent: boolean('skip_consent'),
  enableEndSession: boolean('enable_end_session'),
  subjectType: text('subject_type'),
  scopes: text('scopes').array(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  name: text('name'),
  uri: text('uri'),
  icon: text('icon'),
  contacts: text('contacts').array(),
  tos: text('tos'),
  policy: text('policy'),
  softwareId: text('software_id'),
  softwareVersion: text('software_version'),
  softwareStatement: text('software_statement'),
  redirectUris: text('redirect_uris').array().notNull(),
  postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
  grantTypes: text('grant_types').array(),
  responseTypes: text('response_types').array(),
  public: boolean('public'),
  type: text('type'),
  requirePKCE: boolean('require_pkce'),
  referenceId: text('reference_id'),
  metadata: jsonb('metadata'),
});

export const oauthRefreshTokens = pgTable('oauth_refresh_token', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at'),
  revoked: timestamp('revoked'),
  authTime: timestamp('auth_time'),
  scopes: text('scopes').array().notNull(),
});

export const oauthAccessTokens = pgTable('oauth_access_token', {
  id: text('id').primaryKey(),
  token: text('token').unique(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  refreshId: text('refresh_id').references(() => oauthRefreshTokens.id, {
    onDelete: 'cascade',
  }),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at'),
  scopes: text('scopes').array().notNull(),
});

export const oauthConsents = pgTable('oauth_consent', {
  id: text('id').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  scopes: text('scopes').array().notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

/** Workspace-level SAML/OIDC SSO + SCIM link (Better Auth has no org plugin here). */
export const workspaceSso = pgTable('workspace_sso', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ssoProviderId: text('sso_provider_id'),
  scimProviderId: text('scim_provider_id'),
  /** Require SSO for members whose email matches the domain. */
  enforced: boolean('enforced').notNull().default(false),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

// ---------------------------------------------------------------------------
// Round 2 (Linear parity II) — see .planning/features/10-MASTER-PLAN-2.md
// ---------------------------------------------------------------------------

/** Old keys of issues moved between projects, so links keep resolving. */
export const ticketKeyAliases = pgTable('ticket_key_alias', {
  key: text('key').primaryKey(), // e.g. "APP-12"
  ticketId: text('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull(),
});

export const projectTemplates = pgTable('project_template', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, {
    onDelete: 'cascade',
  }),
  name: text('name').notNull(),
  description: text('description'),
  /** { states, labels, settings, issueTemplates, epics } snapshot. */
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const epicLabels = pgTable(
  'epic_label',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [unique().on(table.projectId, table.name)],
);

export const epicLabelLinks = pgTable(
  'epic_label_link',
  {
    epicId: text('epic_id')
      .notNull()
      .references(() => epics.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => epicLabels.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.epicId, table.labelId] })],
);

export const epicRelations = pgTable(
  'epic_relation',
  {
    id: text('id').primaryKey(),
    epicId: text('epic_id')
      .notNull()
      .references(() => epics.id, { onDelete: 'cascade' }),
    relatedEpicId: text('related_epic_id')
      .notNull()
      .references(() => epics.id, { onDelete: 'cascade' }),
    /** 'blocks' | 'related' */
    type: text('type').notNull(),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [unique().on(table.epicId, table.relatedEpicId, table.type)],
);

export const recurringIssues = pgTable('recurring_issue', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  createdById: text('created_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  description: text('description'),
  /** Default properties: { stateId, priority, assigneeId, labelIds, estimate, dueInDays }. */
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  /** { freq: 'daily'|'weekly'|'monthly', interval, weekdays?: number[], dayOfMonth?: number } */
  schedule: jsonb('schedule').$type<Record<string, unknown>>().notNull(),
  nextRunAt: timestamp('next_run_at').notNull(),
  lastRunAt: timestamp('last_run_at'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const customers = pgTable(
  'customer',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domains: text('domains').array().notNull().default([]),
    /** Annual revenue in whole currency units. */
    revenue: integer('revenue'),
    size: integer('size'),
    tier: text('tier'),
    /** 'lead' | 'active' | 'churned' */
    status: text('status').notNull().default('active'),
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('customer_project_idx').on(table.projectId)],
);

export const slackInstallations = pgTable('slack_installation', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().unique(),
  teamName: text('team_name'),
  /** Encrypted bot token (xoxb-…). */
  botToken: text('bot_token').notNull(),
  botUserId: text('bot_user_id'),
  installedById: text('installed_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  /** Where /ask and message shortcuts file issues. */
  defaultProjectId: text('default_project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const slackUserLinks = pgTable(
  'slack_user_link',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: text('team_id').notNull(),
    slackUserId: text('slack_user_id').notNull(),
    /** Per-user DM notifications on/off. */
    notify: boolean('notify').notNull().default(true),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.teamId] }),
    unique().on(table.teamId, table.slackUserId),
  ],
);

export const dashboards = pgTable('dashboard', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Scope: a project, or null for a personal cross-project dashboard. */
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  shared: boolean('shared').notNull().default(false),
  /** [{ id, type, title, config, x, y, w, h }] */
  widgets: jsonb('widgets').$type<Record<string, unknown>[]>().notNull().default([]),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const documents = pgTable(
  'document',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    epicId: text('epic_id').references(() => epics.id, { onDelete: 'set null' }),
    title: text('title').notNull().default('Untitled'),
    icon: text('icon'),
    /** Markdown snapshot (search, previews, API). The live Yjs state is in collab_doc. */
    content: text('content').notNull().default(''),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedById: text('updated_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sortOrder: doublePrecision('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('document_project_idx').on(table.projectId)],
);

/** Merged Yjs state per collaborative doc, keyed 'doc:<id>' or 'issue:<id>'. */
export const collabDocs = pgTable('collab_doc', {
  key: text('key').primaryKey(),
  stateBase64: text('state_base64').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

/** Incremental Yjs updates since the last compaction (polled by clients). */
export const collabUpdates = pgTable(
  'collab_update',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    key: text('key').notNull(),
    updateBase64: text('update_base64').notNull(),
    clientId: text('client_id'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('collab_update_key_idx').on(table.key, table.id)],
);

export const pushSubscriptions = pgTable('push_subscription', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull(),
});

export const webhookDeliveries = pgTable(
  'webhook_delivery',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    attempt: integer('attempt').notNull().default(0),
    status: integer('status'),
    error: text('error'),
    /** null = done (delivered or gave up). */
    nextAttemptAt: timestamp('next_attempt_at'),
    deliveredAt: timestamp('delivered_at'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('webhook_delivery_next_idx').on(table.nextAttemptAt)],
);

/** GitLab / Bitbucket / Sentry connections (GitHub keeps its project columns). */
export const projectIntegrations = pgTable(
  'project_integration',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** 'gitlab' | 'bitbucket' | 'sentry' */
    provider: text('provider').notNull(),
    /** Provider settings: { baseUrl, repo, workspace, webhookId, stateIds… } */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    /** Encrypted access token, if the provider needs one. */
    token: text('token'),
    /** Webhook signing secret. */
    secret: text('secret'),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [unique().on(table.projectId, table.provider)],
);

/** Inline images pasted into editors outside an issue (docs, epics, updates). */
export const uploads = pgTable('upload', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  uploaderId: text('uploader_id').references(() => users.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  dataBase64: text('data_base64').notNull(),
  createdAt: timestamp('created_at').notNull(),
});
