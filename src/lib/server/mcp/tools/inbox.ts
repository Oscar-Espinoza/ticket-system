// list_inbox: the caller's notifications, limited to projects MCP may reach.

import { z } from 'zod';

import { appUrl } from '@/lib/integrations/app-url';
import { getInbox } from '@/lib/notifications/inbox';
import { describeNotification, notificationPath } from '@/lib/notifications/types';
import { mcpProjects } from '../access';
import type { InboxView, NotificationRow } from '../contracts';
import { decodeOffset, encodeOffset, projectRef, toolError, toolResult, userContentInline } from '../format';
import { defineTool } from './common';

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;

export const listInboxTool = defineTool({
  name: 'list_inbox',
  title: 'List inbox',
  description: 'List your inbox notifications (assignments, mentions, comments, status changes), newest first.',
  scope: 'read',
  input: z.object({
    unread_only: z.boolean().optional().describe('Only unread notifications.'),
    limit: z.number().int().min(1).max(PAGE_MAX).optional().describe(`Default ${PAGE_DEFAULT}, max ${PAGE_MAX}.`),
    cursor: z.string().max(200).optional().describe('The nextCursor from a previous page.'),
  }),
  invoking: 'Reading your inbox…',
  invoked: 'Read your inbox',
  async run({ unread_only, limit, cursor }, { userId }) {
    const offset = decodeOffset(cursor);
    if (offset === null) return toolError('Invalid cursor.');
    const [inbox, projects] = await Promise.all([getInbox(userId), mcpProjects(userId)]);
    const refs = new Map(projects.map((p) => [p.id, projectRef(p)]));
    // Only notifications about projects MCP may reach (D8); project-less ones
    // (e.g. the weekly pulse) can summarize blocked workspaces, so they stay out.
    const visible = inbox.notifications.filter((n) => n.projectId && refs.has(n.projectId));
    const unread = visible.filter((n) => !n.readAt).length;
    const selected = unread_only ? visible.filter((n) => !n.readAt) : visible;
    const pageSize = limit ?? PAGE_DEFAULT;
    const page = selected.slice(offset, offset + pageSize);
    const nextCursor = offset + pageSize < selected.length ? encodeOffset(offset + pageSize) : null;

    const rows: NotificationRow[] = page.map((n) => ({
      id: n.id,
      type: n.type,
      sentence: describeNotification(n.type, n.data, n.actor?.name ?? null),
      read: !!n.readAt,
      at: n.at.toISOString(),
      project: refs.get(n.projectId!) ?? null,
      issue: n.ticketId && n.data.key ? { id: n.ticketId, key: n.data.key, title: n.data.title ?? '' } : null,
      url: `${appUrl()}${notificationPath(n.projectId, n.data)}`,
    }));
    const view: InboxView = { view: 'issue-list', title: 'Inbox', notifications: rows, unread, nextCursor };
    const text = rows.length
      ? [
          `Inbox (${unread} unread${nextCursor ? ', more available' : ''}):`,
          ...rows.map(
            (r) =>
              `- ${r.read ? '' : '**[unread]** '}${r.issue ? `**${r.issue.key}** ${userContentInline(r.issue.title)} — ` : ''}${userContentInline(r.sentence)} (${r.at.slice(0, 10)})`,
          ),
          ...(nextCursor ? [`\nNext page: cursor "${nextCursor}".`] : []),
        ].join('\n')
      : unread_only
        ? 'No unread notifications.'
        : 'Your inbox is empty.';
    return toolResult(text, view);
  },
});
