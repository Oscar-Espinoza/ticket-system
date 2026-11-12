// search_issues, list_issues, my_work, get_issue.

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { tickets } from '@/db/schema';
import { listProjectIssues } from '@/lib/issue-list';
import { PRIORITY_ORDER, STATE_TYPE_ORDER } from '@/lib/issue-model';
import { searchIssues } from '@/lib/search';
import { MARK_END, MARK_START } from '@/lib/search-marks';
import { activeIssue, queryIssues } from '@/lib/tickets';
import { openStateType } from '@/lib/workflow-server';
import { mcpIssue, mcpProject, mcpProjects, type McpProject } from '../access';
import type { IssueDetailView, IssueListView, IssueSummary } from '../contracts';
import {
  decodeOffset,
  encodeOffset,
  issueLine,
  issueListMarkdown,
  projectRef,
  summarizeIssue,
  toolError,
  toolResult,
} from '../format';
import { loadProjectMetadata, resolveAssignee } from '../resolve';
import { defineTool } from './common';
import { COMMENTS_DEFAULT, COMMENTS_MAX, issueDetail, issueDetailMarkdown } from './detail';
import { projectArg } from './projects';

const LIST_DEFAULT = 25;
const LIST_MAX = 100;
const SEARCH_MAX = 50;

const limitArg = (max: number) =>
  z.number().int().min(1).max(max).optional().describe(`How many issues to return (default ${LIST_DEFAULT}, max ${max}).`);
const cursorArg = z.string().max(200).optional().describe('The nextCursor from a previous page.');

const unmark = (text: string) => text.replaceAll(MARK_START, '').replaceAll(MARK_END, '');

export const issueKeyArg = z.string().min(3).max(30).describe('Issue key, e.g. "WEB-123".');

export const searchIssuesTool = defineTool({
  name: 'search_issues',
  title: 'Search issues',
  description:
    'Full-text search over issue titles, descriptions and comments, with optional filters in the query: assignee:me, label:bug, priority:high, state:started, is:open, is:archived. A query that is only filters lists the matches, newest activity first.',
  scope: 'read',
  input: z.object({
    query: z.string().min(1).max(200).describe('Search text and/or filters, e.g. "login timeout assignee:me".'),
    project: projectArg.optional(),
    include_archived: z.boolean().optional().describe('Also search archived issues.'),
    limit: limitArg(SEARCH_MAX),
  }),
  invoking: 'Searching issues…',
  invoked: 'Searched issues',
  async run({ query, project: ref, include_archived, limit }, { userId }) {
    // The reachable projects (membership + D8, from ./access.ts) go into the
    // query itself, so blocked workspaces can't take up the 50 result slots.
    let projects: McpProject[];
    if (ref) {
      const access = await mcpProject(userId, ref, 'read');
      if (!access.ok) return toolError(access.error);
      projects = [access.project];
    } else {
      projects = await mcpProjects(userId);
    }
    const reachable = new Map(projects.map((p) => [p.id, projectRef(p)]));
    const results = await searchIssues(userId, query, {
      projectIds: [...reachable.keys()],
      includeArchived: include_archived === true,
    });
    const issues: IssueSummary[] = results
      .filter((r) => reachable.has(r.issue.projectId))
      .slice(0, limit ?? LIST_DEFAULT)
      .map((r) => summarizeIssue(r.issue, reachable.get(r.issue.projectId)!, r.snippet ? unmark(r.snippet.text) : null));
    const view: IssueListView = { view: 'issue-list', title: `Search: ${query}`, issues, nextCursor: null };
    return toolResult(issueListMarkdown(`Results for "${query}"`, issues, null), view);
  },
});

export const listIssuesTool = defineTool({
  name: 'list_issues',
  title: 'List issues',
  description:
    'List the issues of one project, newest first, with optional filters (state, assignee, label, updated since) and paging. Can group the result by state.',
  scope: 'read',
  input: z.object({
    project: projectArg,
    state: z.string().max(100).optional().describe('State name, id or type (backlog, unstarted, started, completed, canceled, triage).'),
    assignee: z.string().max(200).optional().describe('"me", "none", or a member name, email or id.'),
    label: z.string().max(100).optional().describe('Label name or id.'),
    updated_since: z.string().max(40).optional().describe('ISO 8601 date or date-time.'),
    include_archived: z.boolean().optional(),
    group_by: z.enum(['state']).optional().describe('Group rows by workflow state.'),
    limit: limitArg(LIST_MAX),
    cursor: cursorArg,
  }),
  invoking: 'Listing issues…',
  invoked: 'Listed issues',
  async run(args, { userId }) {
    const access = await mcpProject(userId, args.project, 'read');
    if (!access.ok) return toolError(access.error);
    const { project } = access;

    let assignee = args.assignee ?? null;
    if (assignee && !['me', 'none'].includes(assignee.trim().toLowerCase())) {
      const resolved = resolveAssignee(await loadProjectMetadata(project.id), userId, assignee);
      if (!resolved.ok) return toolError(resolved.error);
      assignee = resolved.value ?? 'none';
    }
    const result = await listProjectIssues(
      userId,
      project.id,
      {
        state: args.state ?? null,
        assignee: assignee?.trim().toLowerCase() === 'me' ? 'me' : assignee,
        label: args.label ?? null,
        updatedSince: args.updated_since ?? null,
        includeArchived: args.include_archived === true,
      },
      { limit: args.limit ?? LIST_DEFAULT, cursor: args.cursor ?? null },
    );
    if (!result.ok) return toolError(result.error);

    const ref = projectRef(project);
    let issues = result.issues.map((i) => summarizeIssue(i, ref));
    if (args.group_by === 'state') {
      const rank = (type: string) => STATE_TYPE_ORDER.indexOf(type as (typeof STATE_TYPE_ORDER)[number]);
      issues = [...issues].sort((a, b) => rank(a.state.type) - rank(b.state.type) || a.state.name.localeCompare(b.state.name));
    }
    const title = `${project.name} issues`;
    const view: IssueListView = { view: 'issue-list', title, issues, nextCursor: result.nextCursor, groupBy: args.group_by ?? null };
    let text: string;
    if (args.group_by === 'state' && issues.length) {
      const groups = new Map<string, IssueSummary[]>();
      for (const issue of issues) groups.set(issue.state.name, [...(groups.get(issue.state.name) ?? []), issue]);
      text = [
        `${title} (${issues.length}${result.nextCursor ? ', more available' : ''}):`,
        ...[...groups].flatMap(([state, rows]) => [`\n### ${state} (${rows.length})`, ...rows.map(issueLine)]),
        ...(result.nextCursor ? [`\nNext page: cursor "${result.nextCursor}".`] : []),
      ].join('\n');
    } else {
      text = issueListMarkdown(title, issues, result.nextCursor);
    }
    return toolResult(text, view);
  },
});

const priorityRank = sql`case ${tickets.priority} ${sql.join(
  PRIORITY_ORDER.map((p, i) => sql`when ${p} then ${i}`),
  sql` `,
)} end`;

export const myWorkTool = defineTool({
  name: 'my_work',
  title: 'My work',
  description: 'List the open issues assigned to you across all your projects, most urgent first, then by due date.',
  scope: 'read',
  input: z.object({ limit: limitArg(LIST_MAX), cursor: cursorArg }),
  invoking: 'Gathering your issues…',
  invoked: 'Gathered your issues',
  async run({ limit, cursor }, { userId }) {
    const offset = decodeOffset(cursor);
    if (offset === null) return toolError('Invalid cursor.');
    const projects = await mcpProjects(userId);
    const refs = new Map(projects.map((p) => [p.id, projectRef(p)]));
    const pageSize = limit ?? LIST_DEFAULT;
    const rows = refs.size
      ? await queryIssues(
          and(
            eq(tickets.assigneeId, userId),
            inArray(tickets.projectId, [...refs.keys()]),
            activeIssue(),
            openStateType(),
          ),
          {
            orderBy: [asc(priorityRank), sql`${tickets.dueDate} asc nulls last`, desc(tickets.updatedAt)],
            limit: pageSize + 1,
            offset,
          },
        )
      : [];
    const nextCursor = rows.length > pageSize ? encodeOffset(offset + pageSize) : null;
    const issues = rows.slice(0, pageSize).map((i) => summarizeIssue(i, refs.get(i.projectId)!));
    const view: IssueListView = { view: 'issue-list', title: 'My work', issues, nextCursor, groupBy: 'priority' };
    return toolResult(issueListMarkdown('Your open issues', issues, nextCursor), view);
  },
});

export const getIssueTool = defineTool({
  name: 'get_issue',
  title: 'Get issue',
  description: 'Get one issue by key: all fields, description, recent comments, sub-issues and relations.',
  scope: 'read',
  input: z.object({
    key: issueKeyArg,
    comments: z
      .number()
      .int()
      .min(0)
      .max(COMMENTS_MAX)
      .optional()
      .describe(`How many of the newest comments to include (default ${COMMENTS_DEFAULT}, max ${COMMENTS_MAX}).`),
  }),
  invoking: 'Opening the issue…',
  invoked: 'Opened the issue',
  async run({ key, comments }, { userId }) {
    const found = await mcpIssue(userId, key, 'read');
    if (!found.ok) return toolError(found.error);
    const detail = await issueDetail(found.issue, found.project, userId, comments ?? COMMENTS_DEFAULT);
    const view: IssueDetailView = { view: 'issue-detail', issue: detail };
    return toolResult(issueDetailMarkdown(detail), view);
  },
});
