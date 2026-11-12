// The only writes MCP allows (docs/mcp/PLAN.md D6): create an issue, update
// its fields, add a comment. Nothing deletes, archives, moves, bulk-edits or
// touches members, roles, settings or integrations. Every successful call is
// audited as `mcp.tool_call` with the OAuth client. The issue and comment
// services re-validate every id against the project.
//
// Refused and failed calls are audited too (../audit.ts, from
// ./common.ts): access failures are tagged with why (`denied`); any other tool
// error is invalid input.
//
// The audit row is written after the change, outside its transaction (the
// services commit their own batch; the row needs the final key and diff). If
// that insert fails the write still happened, so the failure is logged and the
// tool answers with the result: an error would make the model retry and
// duplicate the issue or comment. create_issue also takes an optional
// `request_id` (the issue service's client-chosen id) so a retry after a lost
// response returns the issue it already created; the service says when it
// replayed one, and only the call that created the issue is audited.

import { z } from 'zod';

import { createCommentAs } from '@/lib/comments';
import { createIssue, updateIssueFields } from '@/lib/issue-service';
import type { CreateIssueInput, IssuePatch, IssueRow, Priority } from '@/lib/issue-model';
import { mcpIssue, mcpProject } from '../access';
import { auditWrite as audit, refused } from '../audit';
import type { IssueDetailView } from '../contracts';
import { toolError, toolResult } from '../format';
import {
  loadProjectMetadata,
  resolveAssignee,
  resolveCycle,
  resolveEpic,
  resolveLabels,
  resolveState,
  type ProjectMetadata,
} from '../resolve';
import { defineTool } from './common';
import { issueDetail, issueDetailMarkdown } from './detail';
import { issueKeyArg } from './issues';
import { projectArg } from './projects';

/** An access failure from ../access.ts, tagged for the audit row: hidden (not found) or a role without the right. */
const deny = (access: { error: string; notFound: boolean }) =>
  refused(access.error, { outcome: 'denied', reason: access.notFound ? 'not_found' : 'forbidden_role' });

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .describe('Calendar date, YYYY-MM-DD.');
const labelList = z.array(z.string().min(1).max(100)).max(50);

/** Fields shared by create and update, in human form. */
const fieldArgs = {
  description: z.string().max(10_000).nullable().optional().describe('Markdown. null clears it.'),
  state: z.string().max(100).optional().describe('Workflow state name, id or type.'),
  priority: z.enum(['none', 'urgent', 'high', 'medium', 'low']).optional(),
  assignee: z.string().max(200).nullable().optional().describe('"me", "none", or a member name, email or id.'),
  waiting_on: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .describe('Who the issue is waiting on: "me", "none", or a member name, email or id.'),
  estimate: z.number().min(0).max(1000).nullable().optional().describe('Points. null clears it.'),
  due_date: dateArg.nullable().optional(),
  follow_up: dateArg.nullable().optional().describe('Date to follow up (the assignee is notified that day), YYYY-MM-DD. null clears it.'),
  cycle: z.string().max(100).nullable().optional().describe('Cycle number, name, id, "current", "next" or "none".'),
  epic: z.string().max(200).nullable().optional().describe('Epic name or id, or "none".'),
};

type FieldArgs = {
  description?: string | null;
  state?: string;
  priority?: Priority;
  assignee?: string | null;
  waiting_on?: string | null;
  estimate?: number | null;
  due_date?: string | null;
  follow_up?: string | null;
  cycle?: string | null;
  epic?: string | null;
};

/** Human field values → an IssuePatch, or the first resolution error. */
function toPatch(meta: ProjectMetadata, viewerId: string, args: FieldArgs): { ok: true; patch: IssuePatch } | { ok: false; error: string } {
  const patch: IssuePatch = {};
  if (args.description !== undefined) patch.description = args.description;
  if (args.state !== undefined) {
    const r = resolveState(meta, args.state);
    if (!r.ok) return r;
    patch.stateId = r.value;
  }
  if (args.priority !== undefined) patch.priority = args.priority;
  if (args.assignee !== undefined) {
    const r = resolveAssignee(meta, viewerId, args.assignee);
    if (!r.ok) return r;
    patch.assigneeId = r.value;
  }
  if (args.waiting_on !== undefined) {
    // Same members, same "me" / "none" and the same error as the assignee.
    const r = resolveAssignee(meta, viewerId, args.waiting_on);
    if (!r.ok) return r;
    patch.waitingOnId = r.value;
  }
  if (args.estimate !== undefined) patch.estimate = args.estimate;
  if (args.due_date !== undefined) patch.dueDate = args.due_date;
  if (args.follow_up !== undefined) patch.followUp = args.follow_up;
  if (args.cycle !== undefined) {
    const r = resolveCycle(meta, args.cycle);
    if (!r.ok) return r;
    patch.cycleId = r.value;
  }
  if (args.epic !== undefined) {
    const r = resolveEpic(meta, args.epic);
    if (!r.ok) return r;
    patch.epicId = r.value;
  }
  return { ok: true, patch };
}

export const createIssueTool = defineTool({
  name: 'create_issue',
  title: 'Create issue',
  description:
    'Create an issue in a project. Only the title is required; the other fields take human values (state and label names, "me" as assignee or waiting on).',
  scope: 'write',
  destructive: false,
  input: z.object({
    project: projectArg,
    title: z.string().min(1).max(200),
    ...fieldArgs,
    labels: labelList.optional().describe('Label names or ids.'),
    parent: issueKeyArg.optional().describe('Key of the parent issue (same project), to create a sub-issue.'),
    request_id: z
      .uuid()
      .optional()
      .describe('Optional UUID you generate. Send the same one when retrying: the retry returns the issue already created instead of a duplicate.'),
  }),
  invoking: 'Creating the issue…',
  invoked: 'Created the issue',
  async run(args, credential) {
    const { userId } = credential;
    const access = await mcpProject(userId, args.project, 'write');
    if (!access.ok) return deny(access);
    const { project } = access;
    const meta = await loadProjectMetadata(project.id);
    const fields = toPatch(meta, userId, args);
    if (!fields.ok) return toolError(fields.error);
    const input: CreateIssueInput = { ...fields.patch, title: args.title };
    if (args.labels?.length) {
      const r = resolveLabels(meta, args.labels);
      if (!r.ok) return toolError(r.error);
      input.labelIds = r.value;
    }
    if (args.parent) {
      const parent = await mcpIssue(userId, args.parent, 'read');
      if (!parent.ok || parent.issue.projectId !== project.id || parent.issue.deletedAt) {
        return toolError(`Parent issue "${args.parent}" not found in ${project.key}.`);
      }
      input.parentId = parent.issue.id;
    }

    const requestId = args.request_id?.toLowerCase();
    const result = await createIssue({ userId }, project.id, input, requestId ? { id: requestId } : undefined);
    if (!result.ok) return toolError(result.error);
    // A replay (the same request_id again, including a concurrent duplicate
    // that lost the insert) changed nothing, so only the creating call is audited.
    const replay = result.replayed;
    if (!replay) await audit(credential, 'create_issue', result.issue, 'created');
    const detail = await issueDetail(result.issue, project);
    const view: IssueDetailView = { view: 'issue-detail', issue: detail, changes: [replay ? 'already created' : 'created'] };
    const lead = replay ? `${detail.key} was already created with this request_id.` : `Created ${detail.key}.`;
    return toolResult(`${lead}\n\n${issueDetailMarkdown(detail)}`, view);
  },
});

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Human-readable list of what changed between two versions of an issue. */
export function describeChanges(before: IssueRow, after: IssueRow): string[] {
  const changes: string[] = [];
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? 'none' : String(v));
  const field = (name: string, a: unknown, b: unknown) => {
    if (a !== b) changes.push(`${name}: ${show(a)} → ${show(b)}`);
  };
  field('title', before.title, after.title);
  if ((before.description ?? '') !== (after.description ?? '')) changes.push('description updated');
  field('state', before.state.name, after.state.name);
  field('priority', before.priority, after.priority);
  field('assignee', before.assignee?.name, after.assignee?.name);
  field('waiting on', before.waitingOn?.name, after.waitingOn?.name);
  field('estimate', before.estimate, after.estimate);
  field('due date', before.dueDate, after.dueDate);
  field('follow-up', before.followUp, after.followUp);
  if (before.cycleId !== after.cycleId) changes.push(after.cycleId ? 'cycle set' : 'cycle cleared');
  if (before.epicId !== after.epicId) changes.push(after.epicId ? 'epic set' : 'epic cleared');
  const beforeLabels = before.labels.map((l) => l.name);
  const afterLabels = after.labels.map((l) => l.name);
  if (!sameSet(beforeLabels, afterLabels)) changes.push(`labels: ${show(beforeLabels.join(', '))} → ${show(afterLabels.join(', '))}`);
  return changes;
}

export const updateIssueTool = defineTool({
  name: 'update_issue',
  title: 'Update issue',
  description:
    'Change fields of an existing issue: title, description, state, priority, assignee, waiting on, labels, estimate, due date, follow-up date, cycle or epic. Fields you leave out stay as they are; null clears a field. This overwrites the previous values.',
  scope: 'write',
  destructive: true,
  idempotent: true,
  input: z.object({
    key: issueKeyArg,
    title: z.string().min(1).max(200).optional(),
    ...fieldArgs,
    labels: labelList.optional().describe('Replace all labels with these (names or ids).'),
    add_labels: labelList.optional().describe('Labels to add, keeping the others.'),
    remove_labels: labelList.optional().describe('Labels to remove, keeping the others.'),
  }),
  invoking: 'Updating the issue…',
  invoked: 'Updated the issue',
  async run(args, credential) {
    const { userId } = credential;
    const found = await mcpIssue(userId, args.key, 'write');
    if (!found.ok) return deny(found);
    const { issue: before, project } = found;
    if (before.deletedAt) return toolError(`${before.key} is in the trash; restore it in the app first.`);
    if (args.labels && (args.add_labels || args.remove_labels)) {
      return toolError('Use either labels (replace all) or add_labels / remove_labels, not both.');
    }

    const meta = await loadProjectMetadata(project.id);
    const fields = toPatch(meta, userId, args);
    if (!fields.ok) return toolError(fields.error);
    const patch = fields.patch;
    if (args.title !== undefined) patch.title = args.title;
    for (const [arg, key] of [
      ['labels', 'labelIds'],
      ['add_labels', 'addLabelIds'],
      ['remove_labels', 'removeLabelIds'],
    ] as const) {
      const names = args[arg];
      if (!names) continue;
      const r = resolveLabels(meta, names);
      if (!r.ok) return toolError(r.error);
      patch[key] = r.value;
    }
    if (Object.keys(patch).length === 0) return toolError('Nothing to update: pass at least one field.');

    const result = await updateIssueFields({ userId }, project.id, before.id, patch);
    if (!result.ok) return toolError(result.error);
    const changes = describeChanges(before, result.issue);
    if (changes.length) await audit(credential, 'update_issue', result.issue, 'updated');
    const detail = await issueDetail(result.issue, project);
    const view: IssueDetailView = { view: 'issue-detail', issue: detail, changes };
    return toolResult(
      changes.length ? issueDetailMarkdown(detail, changes) : `No changes: ${detail.key} already had those values.`,
      view,
    );
  },
});

export const addCommentTool = defineTool({
  name: 'add_comment',
  title: 'Add comment',
  description: 'Add a comment (Markdown) to an issue, optionally as a reply to another comment.',
  scope: 'write',
  destructive: false,
  input: z.object({
    key: issueKeyArg,
    body: z.string().min(1).max(10_000).describe('Comment text in Markdown.'),
    reply_to: z.string().max(100).optional().describe('Id of the comment to reply to.'),
  }),
  invoking: 'Posting the comment…',
  invoked: 'Posted the comment',
  async run({ key, body, reply_to }, credential) {
    const { userId } = credential;
    const found = await mcpIssue(userId, key, 'comment');
    if (!found.ok) return deny(found);
    const { issue, project } = found;
    if (issue.deletedAt) return deny({ error: `Issue "${key}" not found. Issue keys look like WEB-123.`, notFound: true });

    const result = await createCommentAs({ userId }, project.id, {
      ticketId: issue.id,
      body,
      parentId: reply_to ?? null,
    });
    if (!result.ok) return toolError(result.error);
    await audit(credential, 'add_comment', issue, 'commented on');
    const detail = await issueDetail(issue, project);
    const view: IssueDetailView = { view: 'issue-detail', issue: detail, changes: ['comment added'] };
    return toolResult(`Comment added to ${issue.key}.\n\n${issueDetailMarkdown(detail)}`, view);
  },
});
