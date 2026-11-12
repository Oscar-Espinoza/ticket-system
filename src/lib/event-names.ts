// Event type strings stored in `activity.type`. A leaf module (no imports), so
// the event bus, its subscribers and client code can all name events without
// import cycles.

export const ISSUE_EVENT = {
  created: 'issue.created',
  updated: 'issue.updated',
  archived: 'issue.archived',
  unarchived: 'issue.unarchived',
  deleted: 'issue.deleted',
  restored: 'issue.restored',
  purged: 'issue.purged',
  /** Two rows per move: one in the source project (no ticket), one per moved issue in the target. */
  moved: 'issue.moved',
  slaBreached: 'issue.sla_breached',
  commentCreated: 'comment.created',
  commentUpdated: 'comment.updated',
  commentDeleted: 'comment.deleted',
  descriptionMentioned: 'description.mentioned',
  sentryResolved: 'sentry.resolved',
} as const;

// Stored names: the `github.` prefix covers GitLab and Bitbucket too (provider-neutral by contract); renaming needs a migration.
export const PR_EVENT = {
  branchCreated: 'github.branch_created',
  prLinked: 'github.pr_linked',
  prMerged: 'github.pr_merged',
  prClosed: 'github.pr_closed',
  commitClosed: 'github.commit_closed',
} as const;
