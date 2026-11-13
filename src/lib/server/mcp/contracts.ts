// Shapes shared by the MCP tools and the MCP Apps views in src/mcp-ui
// (docs/mcp/PLAN.md D7). Every tool result's `structuredContent`
// is one of the `*View` types below, picked by `view`, and goes only to hosts
// that render views (./ui.ts resultFor); every other client gets the Markdown
// `content` alone. Type-only: no runtime imports, so the view
// bundle can import it.

import type { ApiScope } from '@/lib/api-auth';

/** Who is calling `/mcp`, after src/lib/server/mcp/auth.ts accepted the token. */
export interface McpCredential {
  userId: string;
  /** `jwt`: audience-bound OAuth JWT; `oauth`: opaque OAuth token; `api_key`: `lc_…`. */
  via: 'jwt' | 'oauth' | 'api_key';
  /** OAuth client id (null for API keys). */
  clientId: string | null;
  /** API key id (null for OAuth tokens). */
  apiKeyId: string | null;
  /** OAuth client name as registered (self-asserted for dynamic clients). */
  clientName: string | null;
  /**
   * The OAuth client is a host known to render MCP Apps views (claude.ai,
   * ChatGPT, MCP_VIEW_REDIRECT_URIS), told by its redirect URIs
   * (../register.ts rendersViews). False for API keys. Read through
   * ./ui.ts resultFor, never directly.
   */
  viewHost: boolean;
  scopes: ReadonlySet<ApiScope>;
}

export type ViewName = 'issue-list' | 'issue-detail' | 'project-overview' | 'project-list' | 'project-metadata';

export interface UserRef {
  id: string;
  name: string;
}

/**
 * The call that produced one page of a list. The view repeats it with
 * `cursor` set to `nextCursor` for "Load more", so it doesn't depend on the
 * host telling it which tool ran.
 */
export interface PageSource {
  tool: 'list_issues' | 'my_work' | 'list_inbox';
  /** The tool's arguments, without `cursor`. */
  arguments: Record<string, unknown>;
}

export interface StateRef {
  id: string;
  name: string;
  /** backlog | unstarted | started | completed | canceled | triage */
  type: string;
  color: string;
}

export interface LabelRef {
  id: string;
  name: string;
  color: string;
}

export interface ProjectRef {
  id: string;
  key: string;
  name: string;
}

/** One row of an issue list (descriptions truncated). */
export interface IssueSummary {
  id: string;
  key: string;
  title: string;
  project: ProjectRef;
  state: StateRef;
  priority: string;
  assignee: UserRef | null;
  /** The project member the issue is waiting on; null = no one. */
  waitingOn: UserRef | null;
  labels: LabelRef[];
  estimate: number | null;
  dueDate: string | null;
  /** When to follow up, YYYY-MM-DD (a calendar date, like dueDate). */
  followUp: string | null;
  updatedAt: string;
  url: string;
  /** Start of the description (list rows carry a truncated copy). */
  excerpt: string | null;
  /** Present on search results that matched inside the description or a comment. */
  snippet?: string | null;
}

export interface CommentView {
  id: string;
  parentId: string | null;
  author: UserRef | null;
  body: string;
  createdAt: string;
}

export interface IssueDetail extends IssueSummary {
  description: string | null;
  creator: UserRef | null;
  cycle: { id: string; number: number; name: string | null } | null;
  epic: { id: string; name: string } | null;
  parent: { id: string; key: string; title: string } | null;
  subIssues: { id: string; key: string; title: string; state: StateRef }[];
  relations: { kind: string; issue: { id: string; key: string; title: string; state: StateRef } }[];
  /** The newest comments, oldest first. */
  comments: CommentView[];
  commentCount: number;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface IssueListView {
  view: 'issue-list';
  title: string;
  issues: IssueSummary[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
  /** Set when rows are grouped (e.g. by state). */
  groupBy?: 'state' | 'priority' | null;
  /** Present on paged lists; null/absent for search results. */
  source?: PageSource | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  sentence: string;
  read: boolean;
  at: string;
  project: ProjectRef | null;
  issue: { id: string; key: string; title: string } | null;
  url: string;
}

export interface InboxView {
  view: 'issue-list';
  title: string;
  notifications: NotificationRow[];
  unread: number;
  nextCursor: string | null;
  source?: PageSource | null;
}

export interface IssueDetailView {
  view: 'issue-detail';
  issue: IssueDetail;
  /** What a write changed ("state: Todo → Done"), for the model and the view. */
  changes?: string[];
}

export interface ProjectListView {
  view: 'project-list';
  projects: (ProjectRef & {
    description: string | null;
    role: string;
    workspace: { id: string; name: string } | null;
    openIssues: number;
    url: string;
  })[];
}

export interface CycleTotalsView {
  scope: number;
  started: number;
  completed: number;
  scopePoints: number;
  startedPoints: number;
  completedPoints: number;
}

export interface CycleView {
  id: string;
  number: number;
  name: string | null;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  status: 'upcoming' | 'current' | 'past';
  totals: CycleTotalsView;
  burndown: { at: string; totals: CycleTotalsView }[];
}

export interface ProjectOverviewView {
  view: 'project-overview';
  mode: 'project' | 'cycle';
  project: ProjectRef & { url: string };
  /** Open + closed counts per state type. */
  countsByStateType: Record<string, number>;
  cycle: CycleView | null;
  /** Project mode: recently updated issues; cycle mode: the cycle's open issues. */
  issues: IssueSummary[];
}

export interface ProjectMetadataView {
  view: 'project-metadata';
  project: ProjectRef;
  states: StateRef[];
  labels: LabelRef[];
  /** Name and id; `email` only when two members share a name. */
  members: (UserRef & { role: string; email?: string })[];
  cycles: { id: string; number: number; name: string | null; startsAt: string; endsAt: string; status: string }[];
  epics: { id: string; name: string }[];
  priorities: string[];
}

export type McpStructuredContent =
  | IssueListView
  | InboxView
  | IssueDetailView
  | ProjectListView
  | ProjectOverviewView
  | ProjectMetadataView;
