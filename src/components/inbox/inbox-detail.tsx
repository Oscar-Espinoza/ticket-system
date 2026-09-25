'use client';

// Right pane of the inbox: what happened (the group's notifications) above a
// read-only summary of the issue, with read / snooze / archive actions.

import Link from 'next/link';
import { Archive, ArrowLeft, ArrowUpRight, BellDot, Clock, MailOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/editor';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { PickerPopover } from '@/components/issue-pickers/picker-popover';
import { relativeTime } from '@/components/issues/issue-properties';
import { PRIORITY_LABEL, type IssueRow } from '@/lib/issue-model';
import { issuePath } from '@/lib/issue-links';
import { notificationPath } from '@/lib/notifications/types';
import type { InboxGroup } from './inbox-groups';
import { NotificationGlyph, notificationSentence } from './notification-glyph';
import { formatWhen, snoozePresets } from './when-options';
import { WhenPicker } from './when-picker';

const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function InboxDetail({
  group,
  issue,
  onToggleRead,
  onArchive,
  onSnooze,
  onBack,
}: {
  group: InboxGroup;
  /** null when the issue is gone or the viewer left its project. */
  issue: IssueRow | null;
  onToggleRead: () => void;
  onArchive: () => void;
  onSnooze: (until: Date) => void;
  onBack: () => void;
}) {
  const { latest } = group;
  const key = issue?.key ?? latest.data.key ?? '';
  const title = issue?.title ?? latest.data.title ?? 'Notification';
  const href = issue ? issuePath(issue.projectId, issue.key) : null;
  // Pulse and other project-level notifications have no issue; they may carry a link.
  const standalone = !group.ticketId;
  const standaloneHref = standalone ? notificationPath(null, latest.data) : null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex h-11 items-center gap-1 border-b border-border bg-background px-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Back to inbox" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <span className="truncate font-mono text-xs text-muted-foreground">{key}</span>
        {latest.projectName && (
          <span className="truncate text-xs text-muted-foreground">· {latest.projectName}</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleRead}
            aria-label={group.unread ? 'Mark as read (U)' : 'Mark as unread (U)'}
            title={group.unread ? 'Mark as read (U)' : 'Mark as unread (U)'}
          >
            {group.unread ? <MailOpen /> : <BellDot />}
          </Button>
          <PickerPopover
            align="end"
            className="w-auto min-w-64"
            content={(close) => (
              <WhenPicker
                presets={snoozePresets()}
                onPick={(date) => {
                  close();
                  onSnooze(date);
                }}
              />
            )}
          >
            <Button variant="ghost" size="icon-sm" aria-label="Snooze" title="Snooze">
              <Clock />
            </Button>
          </PickerPopover>
          <Button variant="ghost" size="icon-sm" onClick={onArchive} aria-label="Archive (E)" title="Archive (E)">
            <Archive />
          </Button>
          {href && (
            <Button asChild variant="outline" size="sm" className="ml-1">
              <Link href={href}>
                Open issue
                <ArrowUpRight />
              </Link>
            </Button>
          )}
          {standaloneHref && standaloneHref !== '/dashboard/inbox' && (
            <Button asChild variant="outline" size="sm" className="ml-1">
              <Link href={standaloneHref}>
                Open
                <ArrowUpRight />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
        {standalone && latest.data.title && (
          <h2 className="text-lg font-medium leading-snug">{latest.data.title}</h2>
        )}
        <ol className="flex flex-col gap-3" aria-label="Notifications">
          {group.items.map((item) => (
            <li key={item.id} className="flex gap-3">
              <NotificationGlyph notification={item} size={20} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className={item.readAt ? 'text-muted-foreground' : 'font-medium'}>
                    {notificationSentence(item)}
                  </span>
                  <time
                    dateTime={new Date(item.at).toISOString()}
                    title={absolute.format(new Date(item.at))}
                    className="ml-2 text-xs text-muted-foreground"
                    suppressHydrationWarning
                  >
                    {item.type === 'reminder' ? formatWhen(new Date(item.at)) : relativeTime(item.at)}
                  </time>
                </p>
                {item.data.excerpt && (
                  <p className="mt-1 border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-muted-foreground">
                    {item.data.excerpt}
                  </p>
                )}
                {Array.isArray(item.data.lines) && item.data.lines.length > 0 && (
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                    {item.data.lines.map((line, index) => (
                      <li key={index}>{String(line)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>

        {!standalone && (
          <article className="flex flex-col gap-4 rounded-lg border border-border p-5">
            <h2 className="text-lg font-medium leading-snug">
              {href ? (
                <Link href={href} className="hover:underline">
                  {title}
                </Link>
              ) : (
                title
              )}
            </h2>
            {issue ? (
              <>
                <IssueFacts issue={issue} />
                {issue.description?.trim() ? (
                  <Markdown
                    projectId={issue.projectId}
                    ticketKey={issue.key.slice(0, issue.key.lastIndexOf('-'))}
                    className="text-sm"
                  >
                    {issue.description}
                  </Markdown>
                ) : (
                  <p className="text-sm text-muted-foreground">No description.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This issue is no longer available — it was deleted, or you are no longer a member of its
                project.
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}

function IssueFacts({ issue }: { issue: IssueRow }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground [&>div]:flex [&>div]:items-center [&>div]:gap-1.5">
      <div>
        <dt className="sr-only">Status</dt>
        <StateIcon state={issue.state} size={14} />
        <dd className="text-foreground">{issue.state.name}</dd>
      </div>
      <div>
        <dt className="sr-only">Priority</dt>
        <PriorityIcon priority={issue.priority} size={14} />
        <dd>{PRIORITY_LABEL[issue.priority]}</dd>
      </div>
      <div>
        <dt className="sr-only">Assignee</dt>
        {issue.assignee ? (
          <>
            <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
            <dd>{issue.assignee.name}</dd>
          </>
        ) : (
          <dd>Unassigned</dd>
        )}
      </div>
      {(issue.archivedAt || issue.deletedAt) && (
        <div>
          <dt className="sr-only">Visibility</dt>
          <dd className="rounded bg-muted px-1.5 py-0.5">{issue.deletedAt ? 'In trash' : 'Archived'}</dd>
        </div>
      )}
    </dl>
  );
}
